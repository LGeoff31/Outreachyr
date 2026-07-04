from __future__ import annotations

import types
import unittest
from unittest.mock import patch

import resume_profile_parser as parser
from resume_profile_parser import (
    extract_pdf_text,
    normalize_school_name,
    parse_resume_text,
)


def _minimal_pdf_with_text(text: str, link_uri: str | None = None) -> bytes:
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    page_annots = b" /Annots [6 0 R]" if link_uri else b""
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R"
        + page_annots
        + b" >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]
    stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("utf-8")
    objects.append(
        b"5 0 obj\n<< /Length "
        + str(len(stream)).encode("ascii")
        + b" >>\nstream\n"
        + stream
        + b"\nendstream\nendobj\n"
    )
    if link_uri:
        escaped_uri = (
            link_uri.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        )
        objects.append(
            b"6 0 obj\n<< /Type /Annot /Subtype /Link /Rect [72 700 180 720] "
            b"/Border [0 0 0] /A << /S /URI /URI ("
            + escaped_uri.encode("utf-8")
            + b") >> >>\nendobj\n"
        )
    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj)
    xref_at = len(out)
    out.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    out.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    out.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n".encode("ascii")
    )
    return bytes(out)


class ResumeProfileParserTests(unittest.TestCase):
    def test_extract_pdf_text_reads_text_from_pdf_bytes(self) -> None:
        data = _minimal_pdf_with_text("University of Waterloo Resume")

        text = extract_pdf_text(data)

        self.assertIn("University of Waterloo Resume", text)

    def test_extract_pdf_text_includes_clickable_link_annotations(self) -> None:
        data = _minimal_pdf_with_text(
            "GitHub",
            link_uri="https://github.com/Dygitz",
        )

        text = extract_pdf_text(data)

        self.assertIn("https://github.com/Dygitz", text)

    def test_extract_pdf_text_excludes_mailto_link_annotations(self) -> None:
        data = _minimal_pdf_with_text(
            "Email",
            link_uri="mailto:d4ritz@uwaterloo.ca",
        )

        text = extract_pdf_text(data)

        self.assertNotIn("mailto:", text)

    def test_parse_resume_text_returns_failed_when_ai_disabled(self) -> None:
        raw_text = """
        EDUCATION
        University of Waterloo
        Bachelor of Computer Science
        """

        with patch.dict(
            "os.environ",
            {"RESUME_PROFILE_AI_ENABLED": "false"},
            clear=False,
        ):
            profile = parse_resume_text(raw_text)

        self.assertEqual(profile.parse_status, "failed")
        self.assertEqual(profile.parser_version, parser.AI_PARSER_VERSION)
        self.assertIn("AI resume parsing is not configured", profile.parse_error or "")
        self.assertEqual(profile.raw_text, raw_text.strip())
        self.assertEqual(profile.raw_text_hash, parser.raw_text_hash(raw_text.strip()))
        self.assertEqual(profile.education, [])
        self.assertEqual(profile.experience, [])
        self.assertEqual(profile.projects, [])

    def test_resume_ai_model_uses_default_when_override_is_not_allowed(self) -> None:
        with patch.dict(
            "os.environ",
            {"RESUME_PROFILE_AI_MODEL": "llama-3.1-8b-instant"},
            clear=False,
        ):
            with self.assertLogs(parser.logger, level="WARNING"):
                self.assertEqual(parser._resume_ai_model(), parser.DEFAULT_AI_MODEL)

    def test_ai_schema_accepts_partial_items_from_groq(self) -> None:
        profile = parser.AiResumeProfile.model_validate(
            {
                "primary_school_name": "University of Waterloo",
                "primary_major": "Software Engineering",
                "grad_year": 2027,
                "skills": ["Python"],
                "education": [{"school": "University of Waterloo"}],
                "experience": [
                    {
                        "company": "Super.com",
                        "title": "Software Engineer Intern",
                    }
                ],
                "projects": [{"name": "Blindseer"}],
                "links": ["https://github.com/Dygitz"],
            }
        )

        self.assertEqual(profile.education[0].school, "University of Waterloo")
        self.assertEqual(profile.experience[0].company, "Super.com")
        self.assertFalse(hasattr(profile.experience[0], "highlights"))
        self.assertEqual(profile.projects[0].skills, [])

    def test_ai_schema_maps_legacy_technologies_to_skills(self) -> None:
        profile = parser.AiResumeProfile.model_validate(
            {
                "primary_school_name": None,
                "primary_major": None,
                "grad_year": None,
                "skills": [],
                "education": [],
                "experience": [
                    {
                        "company": "Super.com",
                        "technologies": ["Kubernetes", "AWS"],
                    }
                ],
                "projects": [
                    {
                        "name": "Blindseer",
                        "technologies": ["Python", "GCP"],
                    }
                ],
                "links": [],
            }
        )

        self.assertEqual(profile.experience[0].skills, ["Kubernetes", "AWS"])
        self.assertEqual(profile.projects[0].skills, ["Python", "GCP"])

    def test_ai_description_fields_allow_long_text_without_schema_bounds(self) -> None:
        self.assertIn("description", parser.AiExperienceItem.model_fields)
        self.assertIn("description", parser.AiProjectItem.model_fields)

        too_long = "x" * 400
        experience = parser.AiExperienceItem(description=too_long)
        project = parser.AiProjectItem(description=too_long)

        self.assertEqual(experience.description, too_long)
        self.assertEqual(project.description, too_long)

        experience_description = parser.AiExperienceItem.model_fields["description"].description or ""
        project_description = parser.AiProjectItem.model_fields["description"].description or ""
        self.assertIn("Clean concise description", experience_description)
        self.assertIn("supported by the resume text", experience_description)
        self.assertIn("Clean concise description", project_description)
        self.assertIn("supported by the resume text", project_description)
        self.assertIn("Use null when unsupported", experience_description)
        self.assertIn("Use null when unsupported", project_description)
        self.assertNotIn("exact quote", experience_description)
        self.assertNotIn("exact quote", project_description)

    def test_ai_resume_profile_strict_schema_requires_complete_nullable_shape(self) -> None:
        schema = parser._ai_resume_profile_strict_schema()

        def assert_object_schema(node: dict[str, object]) -> None:
            self.assertNotIn("default", node)
            properties = node.get("properties")
            if isinstance(properties, dict):
                self.assertEqual(node.get("additionalProperties"), False)
                self.assertEqual(set(node.get("required") or []), set(properties))
            for value in node.values():
                if isinstance(value, dict):
                    assert_object_schema(value)
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            assert_object_schema(item)

        def missing_required_paths(
            value: object,
            node: dict[str, object],
            path: str = "$",
        ) -> list[str]:
            missing: list[str] = []
            properties = node.get("properties")
            required = node.get("required") or []
            if isinstance(value, dict) and isinstance(properties, dict):
                absent = [key for key in required if key not in value]
                if absent:
                    missing.append(f"{path}: {', '.join(absent)}")
                for key, child in properties.items():
                    if key in value and isinstance(child, dict):
                        missing.extend(
                            missing_required_paths(value[key], child, f"{path}.{key}")
                        )
            items = node.get("items")
            if isinstance(value, list) and isinstance(items, dict):
                for index, item in enumerate(value):
                    missing.extend(
                        missing_required_paths(item, items, f"{path}[{index}]")
                    )
            return missing

        def nullable_string_schema(node: dict[str, object]) -> dict[str, object] | None:
            for option in node.get("anyOf") or []:
                if isinstance(option, dict) and option.get("type") == "string":
                    return option
            return None

        experience_item = schema["properties"]["experience"]["items"]
        project_item = schema["properties"]["projects"]["items"]
        self.assertNotIn(
            "maxLength",
            nullable_string_schema(experience_item["properties"]["description"]) or {},
        )
        self.assertNotIn(
            "maxLength",
            nullable_string_schema(project_item["properties"]["description"]) or {},
        )

        complete_nullable_profile = {
            "primary_school_name": None,
            "primary_major": None,
            "grad_year": None,
            "skills": [],
            "education": [
                {
                    "school": "University of Waterloo",
                    "degree": None,
                    "major": None,
                    "start_year": None,
                    "end_year": None,
                    "is_current": None,
                    "confidence": None,
                }
            ],
            "experience": [
                {
                    "title": "Software Engineer Intern",
                    "company": "Super.com",
                    "location": None,
                    "start_date": None,
                    "end_date": None,
                    "is_current": None,
                    "description": None,
                    "skills": [],
                    "confidence": None,
                }
            ],
            "projects": [
                {
                    "name": "Blindseer",
                    "description": None,
                    "skills": [],
                    "links": [],
                    "start_date": None,
                    "end_date": None,
                    "confidence": None,
                }
            ],
            "links": [],
        }

        assert_object_schema(schema)
        self.assertEqual(missing_required_paths(complete_nullable_profile, schema), [])
        parser.AiResumeProfile.model_validate(complete_nullable_profile)

    def test_langchain_groq_uses_strict_json_schema_structured_output(self) -> None:
        calls: dict[str, object] = {}
        ai_profile = parser.AiResumeProfile(
            primary_school_name="University of Waterloo",
            primary_major="Computer Science",
            grad_year=2027,
            skills=[],
            education=[],
            experience=[],
            projects=[],
            links=[],
        )

        class FakeStructuredLlm:
            def invoke(self, messages):
                calls["messages"] = messages
                return ai_profile

        class FakeChatGroq:
            def __init__(self, **kwargs):
                calls["init"] = kwargs

            def with_structured_output(self, schema, **kwargs):
                calls["schema"] = schema
                calls["structured_output"] = kwargs
                return FakeStructuredLlm()

        with (
            patch.dict(
                "sys.modules",
                {"langchain_groq": types.SimpleNamespace(ChatGroq=FakeChatGroq)},
            ),
            patch.dict(
                "os.environ",
                {"RESUME_PROFILE_AI_MODEL": parser.DEFAULT_AI_MODEL},
                clear=False,
            ),
        ):
            result = parser._parse_resume_text_with_langchain_groq("resume text")

        self.assertIs(result, ai_profile)
        self.assertEqual(calls["init"]["max_tokens"], 4096)
        self.assertEqual(calls["init"]["temperature"], 0)
        self.assertEqual(calls["schema"], parser._ai_resume_profile_strict_schema())
        self.assertEqual(
            calls["structured_output"],
            {"method": "json_schema", "strict": True},
        )
        system_message = calls["messages"][0][1]
        self.assertIn("Every object must include every key", system_message)
        self.assertIn("Use null for unknown scalar fields", system_message)
        self.assertIn("empty lists for absent repeated fields", system_message)
        self.assertIn("clean semantic resume fields", system_message)
        self.assertIn("Use only information present in the resume", system_message)
        self.assertIn("Clean PDF artifacts", system_message)
        self.assertIn("Split date ranges", system_message)
        self.assertIn("Do not invent", system_message)
        self.assertNotIn("exact text copied", system_message)
        self.assertNotIn("Retain original wording and punctuation", system_message)
        self.assertNotIn("Description fields must be at most", system_message)

    def test_langchain_groq_retries_strict_json_generation_failure_once(self) -> None:
        calls: dict[str, object] = {"messages": []}
        ai_profile = parser.AiResumeProfile(
            primary_school_name="University of Waterloo",
            primary_major="Computer Science",
            grad_year=2027,
            skills=[],
            education=[],
            experience=[],
            projects=[],
            links=[],
        )

        class FakeStructuredLlm:
            def __init__(self):
                self.invocations = 0

            def invoke(self, messages):
                calls["messages"].append(messages)
                self.invocations += 1
                if self.invocations == 1:
                    raise RuntimeError(
                        "Generated JSON does not match the expected schema"
                    )
                return ai_profile

        class FakeChatGroq:
            def __init__(self, **kwargs):
                calls["init"] = kwargs

            def with_structured_output(self, schema, **kwargs):
                calls["schema"] = schema
                calls["structured_output"] = kwargs
                return FakeStructuredLlm()

        with (
            patch.dict(
                "sys.modules",
                {"langchain_groq": types.SimpleNamespace(ChatGroq=FakeChatGroq)},
            ),
            patch.dict(
                "os.environ",
                {"RESUME_PROFILE_AI_MODEL": parser.DEFAULT_AI_MODEL},
                clear=False,
            ),
            self.assertLogs(parser.logger, level="WARNING") as logs,
        ):
            result = parser._parse_resume_text_with_langchain_groq("resume text")

        self.assertIs(result, ai_profile)
        self.assertTrue(any("retrying once" in msg for msg in logs.output))
        self.assertEqual(len(calls["messages"]), 2)
        self.assertIn("Previous attempt failed", calls["messages"][1][0][1])

    def test_resume_ai_max_tokens_uses_configured_positive_integer(self) -> None:
        with patch.dict(
            "os.environ",
            {"RESUME_PROFILE_AI_MAX_TOKENS": "4096"},
            clear=False,
        ):
            self.assertEqual(parser._resume_ai_max_tokens(), 4096)

    def test_resume_ai_max_tokens_defaults_when_invalid(self) -> None:
        with patch.dict(
            "os.environ",
            {"RESUME_PROFILE_AI_MAX_TOKENS": "not-a-number"},
            clear=False,
        ):
            with self.assertLogs(parser.logger, level="WARNING"):
                self.assertEqual(parser._resume_ai_max_tokens(), 4096)

    def test_parse_resume_text_uses_langchain_groq_when_configured(self) -> None:
        ai_profile = parser.AiResumeProfile(
            primary_school_name="University of Waterloo",
            primary_major="Computer Science",
            grad_year=2027,
            skills=["Python", "React", "python"],
            education=[
                parser.AiEducationItem(
                    school="University of Waterloo",
                    degree="Bachelor of Computer Science",
                    major="Computer Science",
                    start_year=2023,
                    end_year=2027,
                    is_current=True,
                    confidence=0.95,
                )
            ],
            experience=[
                parser.AiExperienceItem(
                    title="Software Engineer Intern",
                    company="Snowflake",
                    location=None,
                    start_date="2025-05",
                    end_date="2025-08",
                    is_current=False,
                    description="Built ingestion pipelines.",
                    skills=["Python", "SQL"],
                    confidence=0.9,
                )
            ],
            projects=[
                parser.AiProjectItem(
                    name="Distributed Job Queue",
                    description="Built a worker system.",
                    skills=["Redis", "Docker"],
                    links=["https://github.com/geoff/queue"],
                    start_date=None,
                    end_date=None,
                    confidence=0.88,
                )
            ],
            links=["https://github.com/geoff"],
        )

        with (
            patch.dict(
                "os.environ",
                {
                    "GROQ_API_KEY": "test-key",
                    "RESUME_PROFILE_AI_ENABLED": "true",
                },
                clear=False,
            ),
            patch.object(
                parser,
                "_parse_resume_text_with_langchain_groq",
                return_value=ai_profile,
            ) as parse_with_ai,
        ):
            profile = parse_resume_text(
                "University of Waterloo\n"
                "Computer Science\n"
                "Python\n"
                "React\n"
                "SQL\n"
                "Redis\n"
                "Docker\n"
                "Snowflake\n"
                "Built ingestion pipelines.\n"
                "Distributed Job Queue\n"
                "Built a worker system.\n"
                "https://github.com/geoff\n"
                "https://github.com/geoff/queue"
            )

        parse_with_ai.assert_called_once_with(
            "University of Waterloo\n"
            "Computer Science\n"
            "Python\n"
            "React\n"
            "SQL\n"
            "Redis\n"
            "Docker\n"
            "Snowflake\n"
            "Built ingestion pipelines.\n"
            "Distributed Job Queue\n"
            "Built a worker system.\n"
            "https://github.com/geoff\n"
            "https://github.com/geoff/queue"
        )
        self.assertEqual(profile.parser_version, parser.AI_PARSER_VERSION)
        self.assertEqual(profile.primary_school_name, "University of Waterloo")
        self.assertEqual(profile.primary_school_normalized, "university of waterloo")
        self.assertEqual(profile.primary_major, "Computer Science")
        self.assertEqual(profile.grad_year, 2027)
        self.assertEqual(profile.skills, ["Python", "React"])
        self.assertEqual(profile.experience[0]["company"], "Snowflake")
        self.assertEqual(profile.experience[0]["description"], "Built ingestion pipelines.")
        self.assertEqual(profile.experience[0]["skills"], ["Python", "SQL"])
        self.assertNotIn("highlights", profile.experience[0])
        self.assertNotIn("technologies", profile.experience[0])
        self.assertEqual(profile.projects[0]["description"], "Built a worker system.")
        self.assertEqual(profile.projects[0]["skills"], ["Redis", "Docker"])
        self.assertNotIn("technologies", profile.projects[0])
        self.assertEqual(
            profile.links,
            ["https://github.com/geoff", "https://github.com/geoff/queue"],
        )

    def test_parse_resume_text_keeps_clean_semantic_ai_values(self) -> None:
        raw_text = (
            "WATonomous- Autonomous Software Engineer                                                                      Feb - Oct 2024\n"
            "ROS2, Python, C++, Docker, PyTorch                                                                                                     Waterloo, Ontario\n"
            "Cookd/external-link-alt|Next.js, React, NestJS, Prisma, PostgreSQL, Supabase, Docker, Railway, LangChain/Groq\n"
            "    * Built & launchedsocial cooking platformfor saving recipes, sharing meals, adding friends, and tracking cooking\n"
            "https://cookd.ca\n"
        )
        ai_profile = parser.AiResumeProfile(
            primary_school_name=None,
            primary_major=None,
            grad_year=None,
            skills=["Python", "React"],
            education=[],
            experience=[
                parser.AiExperienceItem(
                    title="Autonomous Software Engineer",
                    company="WATonomous",
                    location="Waterloo, Ontario",
                    start_date="Feb 2024",
                    end_date="Oct 2024",
                    is_current=False,
                    description=None,
                    skills=["ROS2", "Python", "C++", "Docker", "PyTorch"],
                )
            ],
            projects=[
                parser.AiProjectItem(
                    name="Cookd",
                    description="Built and launched social cooking platform for saving recipes, sharing meals, adding friends, and tracking cooking",
                    skills=[
                        "Next.js",
                        "React",
                        "NestJS",
                        "Prisma",
                        "PostgreSQL",
                        "Supabase",
                        "Docker",
                        "Railway",
                        "LangChain/Groq",
                    ],
                    links=["https://cookd.ca"],
                    start_date=None,
                    end_date=None,
                )
            ],
            links=["https://cookd.ca"],
        )

        with (
            patch.dict(
                "os.environ",
                {
                    "GROQ_API_KEY": "test-key",
                    "RESUME_PROFILE_AI_ENABLED": "true",
                },
                clear=False,
            ),
            patch.object(
                parser,
                "_parse_resume_text_with_langchain_groq",
                return_value=ai_profile,
            ),
        ):
            profile = parse_resume_text(raw_text)

        self.assertEqual(profile.skills, ["Python", "React"])
        self.assertEqual(profile.experience[0]["company"], "WATonomous")
        self.assertEqual(profile.experience[0]["start_date"], "Feb 2024")
        self.assertEqual(profile.experience[0]["end_date"], "Oct 2024")
        self.assertEqual(profile.experience[0]["skills"], ["ROS2", "Python", "C++", "Docker", "PyTorch"])
        self.assertEqual(profile.projects[0]["name"], "Cookd")
        self.assertEqual(
            profile.projects[0]["description"],
            "Built and launched social cooking platform for saving recipes, sharing meals, adding friends, and tracking cooking",
        )
        self.assertEqual(profile.projects[0]["skills"], [
            "Next.js",
            "React",
            "NestJS",
            "Prisma",
            "PostgreSQL",
            "Supabase",
            "Docker",
            "Railway",
            "LangChain/Groq",
        ])
        self.assertEqual(profile.projects[0]["links"], ["https://cookd.ca"])
        self.assertEqual(profile.links, ["https://cookd.ca"])

    def test_parse_resume_text_preserves_long_ai_descriptions_after_schema_parse(self) -> None:
        overlong_description = (
            "Built & launched social cooking platform for saving recipes, sharing meals, "
            "adding friends, and tracking cooking; engineered AI recipe import pipeline "
            "that extracts structured recipes from websites and social media; owned "
            "infrastructure across Docker/Railway, Supabase auth/storage, Prisma "
            "migrations, and CI."
        )
        ai_profile = parser.AiResumeProfile(
            primary_school_name=None,
            primary_major=None,
            grad_year=None,
            skills=[],
            education=[],
            experience=[
                parser.AiExperienceItem(
                    title="Software Engineer Intern",
                    company="Example",
                    location=None,
                    start_date=None,
                    end_date=None,
                    is_current=None,
                    description=overlong_description,
                    skills=[],
                    confidence=None,
                )
            ],
            projects=[
                parser.AiProjectItem(
                    name="Cookd",
                    description=overlong_description,
                    skills=[],
                    links=[],
                    start_date=None,
                    end_date=None,
                    confidence=None,
                )
            ],
            links=[],
        )

        with (
            patch.dict(
                "os.environ",
                {
                    "GROQ_API_KEY": "test-key",
                    "RESUME_PROFILE_AI_ENABLED": "true",
                },
                clear=False,
            ),
            patch.object(
                parser,
                "_parse_resume_text_with_langchain_groq",
                return_value=ai_profile,
            ),
        ):
            profile = parse_resume_text("Cookd\nBuilt & launched social cooking platform")

        self.assertEqual(
            profile.experience[0]["description"],
            overlong_description,
        )
        self.assertEqual(
            profile.projects[0]["description"],
            overlong_description,
        )

    def test_parse_resume_text_cleans_ai_school_location_suffix(self) -> None:
        ai_profile = parser.AiResumeProfile(
            primary_school_name="University of Waterloo Waterloo, Ontario",
            primary_major="Software Engineering",
            grad_year=2027,
            skills=[],
            education=[
                parser.AiEducationItem(
                    school="University of Waterloo Waterloo, Ontario",
                    degree="BSE",
                    major="Software Engineering",
                    end_year=2027,
                )
            ],
            experience=[],
            projects=[],
            links=[],
        )

        with (
            patch.dict(
                "os.environ",
                {
                    "GROQ_API_KEY": "test-key",
                    "RESUME_PROFILE_AI_ENABLED": "true",
                },
                clear=False,
            ),
            patch.object(
                parser,
                "_parse_resume_text_with_langchain_groq",
                return_value=ai_profile,
            ),
        ):
            profile = parse_resume_text(
                "University of Waterloo Waterloo, Ontario\n"
                "Software Engineering\n"
                "BSE\n"
                "2027"
            )

        self.assertEqual(profile.primary_school_name, "University of Waterloo")
        self.assertEqual(profile.education[0]["school"], "University of Waterloo")
        self.assertEqual(
            profile.primary_school_normalized,
            normalize_school_name("University of Waterloo"),
        )

    def test_parse_resume_text_returns_failed_when_ai_fails(self) -> None:
        raw_text = """
        EDUCATION
        University of Waterloo
        Bachelor of Computer Science
        Expected 2027
        """

        with (
            patch.dict(
                "os.environ",
                {
                    "GROQ_API_KEY": "test-key",
                    "RESUME_PROFILE_AI_ENABLED": "true",
                },
                clear=False,
            ),
            patch.object(
                parser,
                "_parse_resume_text_with_langchain_groq",
                side_effect=RuntimeError("Groq unavailable"),
            ),
            self.assertLogs(parser.logger, level="WARNING") as logs,
        ):
            profile = parse_resume_text(raw_text)

        self.assertEqual(profile.parse_status, "failed")
        self.assertEqual(profile.parser_version, parser.AI_PARSER_VERSION)
        self.assertIsNone(profile.primary_school_name)
        self.assertIn("Groq unavailable", profile.parse_error or "")
        self.assertEqual(profile.raw_text, raw_text.strip())
        self.assertTrue(any("AI resume parsing failed" in msg for msg in logs.output))


if __name__ == "__main__":
    unittest.main()
