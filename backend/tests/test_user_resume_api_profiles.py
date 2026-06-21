from __future__ import annotations

import types
import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

from resume_profile_parser import normalize_school_name
from user_resume_api import (
    PatchResumeBody,
    ProfilePatchBody,
    _apply_profile_patch,
    _build_resume_profile_row,
    _row_json,
)


class UserResumeApiProfileTests(unittest.TestCase):
    def _resume_row(self, profile=None):
        return types.SimpleNamespace(
            id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            owner_id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
            resume_storage_path="owner/resume.pdf",
            display_name="Backend Resume",
            file_type="PDF",
            byte_size=1234,
            focus="Unassigned",
            used_in_campaigns=0,
            is_default=False,
            status="Ready",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            profile=profile,
        )

    def test_row_json_omits_profile_for_existing_resume_without_profile(self) -> None:
        payload = _row_json(self._resume_row(profile=None))

        self.assertNotIn("profile", payload)

    def test_row_json_includes_ready_resume_profile(self) -> None:
        confirmed_at = datetime(2026, 1, 3, tzinfo=timezone.utc)
        profile = types.SimpleNamespace(
            parse_status="ready",
            primary_school_name="University of Waterloo",
            primary_school_normalized="university of waterloo",
            primary_major="Data Science",
            grad_year=2027,
            skills=["Python", "TypeScript"],
            education_json=[{"school": "University of Waterloo"}],
            experience_json=[{"title": "Software Engineer Intern"}],
            projects_json=[{"name": "Distributed Job Queue"}],
            links_json=["https://github.com/geoff"],
            user_confirmed_at=confirmed_at,
        )

        payload = _row_json(self._resume_row(profile=profile))

        self.assertEqual(payload["profile"]["parse_status"], "ready")
        self.assertEqual(
            payload["profile"]["primary_school_name"],
            "University of Waterloo",
        )
        self.assertEqual(payload["profile"]["skills"], ["Python", "TypeScript"])
        self.assertEqual(
            payload["profile"]["education"],
            [{"school": "University of Waterloo"}],
        )
        self.assertEqual(
            payload["profile"]["user_confirmed_at"],
            confirmed_at.isoformat(),
        )

    def test_apply_profile_patch_normalizes_and_confirms_user_edits(self) -> None:
        profile = types.SimpleNamespace(
            parse_status="ready",
            parse_error=None,
            primary_school_name=None,
            primary_school_normalized=None,
            primary_major=None,
            grad_year=None,
            skills=[],
            education_json=[],
            experience_json=[],
            projects_json=[],
            links_json=[],
            user_confirmed_at=None,
        )
        confirmed_at = datetime(2026, 1, 4, tzinfo=timezone.utc)
        body = ProfilePatchBody(
            primary_school_name=" University of Waterloo ",
            primary_major=" Software Engineering ",
            grad_year=2027,
            skills=[" Python ", "", "TypeScript", "python"],
            education=[{"school": "University of Waterloo"}],
            experience=[{"title": "Software Engineer Intern"}],
            projects=[{"name": "Distributed Job Queue"}],
            links=[" https://github.com/geoff ", ""],
        )

        _apply_profile_patch(profile, body, confirmed_at=confirmed_at)

        self.assertEqual(profile.parse_status, "ready")
        self.assertIsNone(profile.parse_error)
        self.assertEqual(profile.primary_school_name, "University of Waterloo")
        self.assertEqual(
            profile.primary_school_normalized,
            normalize_school_name("University of Waterloo"),
        )
        self.assertEqual(profile.primary_major, "Software Engineering")
        self.assertEqual(profile.grad_year, 2027)
        self.assertEqual(profile.skills, ["Python", "TypeScript"])
        self.assertEqual(profile.links_json, ["https://github.com/geoff"])
        self.assertEqual(profile.user_confirmed_at, confirmed_at)

    def test_patch_resume_body_accepts_nested_profile_payload(self) -> None:
        body = PatchResumeBody(
            profile={
                "primary_school_name": "University of Waterloo",
                "primary_major": "Software Engineering",
                "grad_year": 2027,
                "skills": ["Python"],
                "education": [{"school": "University of Waterloo"}],
                "experience": [],
                "projects": [],
                "links": [],
            }
        )

        self.assertIsNotNone(body.profile)
        self.assertEqual(
            body.profile.primary_school_name if body.profile else None,
            "University of Waterloo",
        )

    def test_build_resume_profile_row_uses_parser_version_from_result(self) -> None:
        parsed = types.SimpleNamespace(
            raw_text="resume text",
            raw_text_hash="abc123",
            parse_status="ready",
            parser_version="langchain-groq-v1",
            parse_error=None,
            primary_school_name="University of Waterloo",
            primary_school_normalized="university of waterloo",
            primary_major="Computer Science",
            grad_year=2027,
            skills=["Python"],
            education=[{"school": "University of Waterloo"}],
            experience=[],
            projects=[],
            links=[],
        )

        with patch("user_resume_api.parse_resume_pdf", return_value=parsed):
            row = _build_resume_profile_row(
                uuid.UUID("00000000-0000-0000-0000-000000000001"),
                b"%PDF",
            )

        self.assertEqual(row.parser_version, "langchain-groq-v1")


if __name__ == "__main__":
    unittest.main()
