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
        self.assertEqual(profile.experience[0].highlights, [])
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
        self.assertEqual(calls["schema"], parser._ai_resume_profile_strict_schema())
        self.assertEqual(
            calls["structured_output"],
            {"method": "json_schema", "strict": True},
        )

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

    def test_ai_resume_profile_strict_schema_requires_all_nested_fields(self) -> None:
        schema = parser._ai_resume_profile_strict_schema()

        def assert_object_schema(node: dict[str, object]) -> None:
            self.assertNotIn("default", node)
            if node.get("type") == "object":
                properties = node.get("properties")
                self.assertIsInstance(properties, dict)
                self.assertEqual(node.get("additionalProperties"), False)
                self.assertEqual(
                    set(node.get("required") or []),
                    set(properties or {}),
                )
            for value in node.values():
                if isinstance(value, dict):
                    assert_object_schema(value)
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            assert_object_schema(item)

        assert_object_schema(schema)

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
                    highlights=["Built ingestion pipelines."],
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
            profile = parse_resume_text("plain text without section headings")

        parse_with_ai.assert_called_once_with("plain text without section headings")
        self.assertEqual(profile.parser_version, parser.AI_PARSER_VERSION)
        self.assertEqual(profile.primary_school_name, "University of Waterloo")
        self.assertEqual(profile.primary_school_normalized, "university of waterloo")
        self.assertEqual(profile.primary_major, "Computer Science")
        self.assertEqual(profile.grad_year, 2027)
        self.assertEqual(profile.skills, ["Python", "React"])
        self.assertEqual(profile.experience[0]["company"], "Snowflake")
        self.assertEqual(profile.experience[0]["skills"], ["Python", "SQL"])
        self.assertNotIn("technologies", profile.experience[0])
        self.assertEqual(profile.projects[0]["skills"], ["Redis", "Docker"])
        self.assertNotIn("technologies", profile.projects[0])
        self.assertEqual(
            profile.links,
            ["https://github.com/geoff", "https://github.com/geoff/queue"],
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
            profile = parse_resume_text("raw resume text")

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
