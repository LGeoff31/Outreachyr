from __future__ import annotations

import unittest
from unittest.mock import patch

import send


class SendDiscoveryTests(unittest.TestCase):
    def test_discover_prefers_school_specific_recruiter_results(self) -> None:
        queries: list[str] = []

        def fake_discover_serpapi(q: str, domain: str, api_key: str):
            queries.append(q)
            if '"University of Waterloo"' in q:
                return [
                    ("alice.smith@nvidia.com", "Alice"),
                    ("shared.recruiter@nvidia.com", "Shared"),
                ]
            if "campus recruiter" in q:
                return [
                    ("shared.recruiter@nvidia.com", "Shared"),
                    ("bob.jones@nvidia.com", "Bob"),
                ]
            return [("carol.ng@nvidia.com", "Carol")]

        with (
            patch.object(send, "serpapi_api_key", return_value="test-key"),
            patch.object(send, "domain_for_company", return_value="nvidia.com"),
            patch.object(send, "_discover_serpapi", side_effect=fake_discover_serpapi),
        ):
            recipients = send.discover(
                "Nvidia",
                school_name="University of Waterloo",
                school_normalized="university of waterloo",
            )

        self.assertEqual(
            recipients,
            [
                ("alice.smith@nvidia.com", "Alice"),
                ("shared.recruiter@nvidia.com", "Shared"),
                ("bob.jones@nvidia.com", "Bob"),
                ("carol.ng@nvidia.com", "Carol"),
            ],
        )
        self.assertIn('"Nvidia" "University of Waterloo" recruiter', queries[0])
        self.assertTrue(any("campus recruiter" in q for q in queries[1:]))


if __name__ == "__main__":
    unittest.main()
