from __future__ import annotations

import unittest
from unittest.mock import patch

import send


class SendDiscoveryTests(unittest.TestCase):
    def test_ingest_search_items_preserves_linkedin_profile_url(self) -> None:
        candidates = send._ingest_search_items(
            [
                {
                    "title": "Alice Smith - Campus Recruiter - Nvidia | LinkedIn",
                    "snippet": "Campus recruiter at Nvidia",
                    "link": "https://www.linkedin.com/in/alice-smith/",
                }
            ],
            "nvidia.com",
        )

        self.assertEqual(
            candidates,
            [
                {
                    "email": "alice.smith@nvidia.com",
                    "greeting_name": "Alice",
                    "linkedin_url": "https://www.linkedin.com/in/alice-smith/",
                }
            ],
        )

    def test_discover_keeps_tuple_api_while_candidate_api_has_url(self) -> None:
        def fake_discover_serpapi(q: str, domain: str, api_key: str):
            return [
                {
                    "email": "alice.smith@nvidia.com",
                    "greeting_name": "Alice",
                    "linkedin_url": "https://www.linkedin.com/in/alice-smith/",
                }
            ]

        with (
            patch.object(send, "serpapi_api_key", return_value="test-key"),
            patch.object(send, "domain_for_company", return_value="nvidia.com"),
            patch.object(send, "_discover_serpapi", side_effect=fake_discover_serpapi),
        ):
            recipients = send.discover("Nvidia")
            candidates = send.discover_candidates("Nvidia")

        self.assertEqual(recipients, [("alice.smith@nvidia.com", "Alice")])
        self.assertEqual(
            candidates,
            [
                {
                    "email": "alice.smith@nvidia.com",
                    "greeting_name": "Alice",
                    "linkedin_url": "https://www.linkedin.com/in/alice-smith/",
                }
            ],
        )

    def test_discover_prefers_school_specific_recruiter_results(self) -> None:
        queries: list[str] = []

        def fake_discover_serpapi(q: str, domain: str, api_key: str):
            queries.append(q)
            if '"University of Waterloo"' in q:
                return [
                    {"email": "alice.smith@nvidia.com", "greeting_name": "Alice"},
                    {"email": "shared.recruiter@nvidia.com", "greeting_name": "Shared"},
                ]
            if "campus recruiter" in q:
                return [
                    {"email": "shared.recruiter@nvidia.com", "greeting_name": "Shared"},
                    {"email": "bob.jones@nvidia.com", "greeting_name": "Bob"},
                ]
            return [{"email": "carol.ng@nvidia.com", "greeting_name": "Carol"}]

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

    def test_discover_treats_serpapi_no_results_as_empty(self) -> None:
        def fake_discover_serpapi(q: str, domain: str, api_key: str):
            raise RuntimeError(
                "SerpAPI: Google hasn't returned any results for this query."
            )

        with (
            patch.object(send, "serpapi_api_key", return_value="test-key"),
            patch.object(send, "domain_for_company", return_value="palantir.com"),
            patch.object(send, "_discover_serpapi", side_effect=fake_discover_serpapi),
        ):
            recipients = send.discover("Palantir")

        self.assertEqual(recipients, [])


if __name__ == "__main__":
    unittest.main()
