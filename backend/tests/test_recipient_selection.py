from __future__ import annotations

import sys
from pathlib import Path
from unittest import TestCase

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from recipient_selection import parse_selected_recipients_json


class SelectedRecipientParsingTests(TestCase):
    def test_parses_valid_selected_recipients_and_deduplicates_email(self) -> None:
        people, error = parse_selected_recipients_json(
            """
            [
              {"email": "First.Person@Example.com", "greeting_name": "First"},
              {"email": "first.person@example.com", "greeting_name": "Duplicate"},
              {"email": "second@example.com", "greeting_name": ""}
            ]
            """
        )

        self.assertIsNone(error)
        self.assertEqual(
            people,
            [
                ("first.person@example.com", "First"),
                ("second@example.com", ""),
            ],
        )

    def test_rejects_invalid_email(self) -> None:
        people, error = parse_selected_recipients_json(
            '[{"email": "not-an-email", "greeting_name": "Bad"}]'
        )

        self.assertIsNone(people)
        self.assertEqual(error, "Recipient 1 has an invalid email address.")

    def test_empty_payload_means_no_override(self) -> None:
        people, error = parse_selected_recipients_json("")

        self.assertIsNone(people)
        self.assertIsNone(error)
