from __future__ import annotations

import types
import unittest
import uuid
from datetime import datetime, timezone

from user_resume_api import _row_json


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


if __name__ == "__main__":
    unittest.main()
