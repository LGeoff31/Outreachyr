from __future__ import annotations

import unittest
from unittest.mock import patch

import send


class SendDiscoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        send.clear_preview_discovery_cache()

    def tearDown(self) -> None:
        send.clear_preview_discovery_cache()

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

    def test_select_preview_recipients_caps_at_five(self) -> None:
        candidates = [
            {"email": f"recruiter{i}@nvidia.com", "greeting_name": f"R{i}"}
            for i in range(8)
        ]
        picked = send.select_preview_recipients(candidates)
        self.assertEqual(len(picked), 5)

    def test_select_preview_recipients_is_stable_for_same_pool(self) -> None:
        candidates = [
            {"email": "alice.smith@nvidia.com", "greeting_name": "Alice"},
            {"email": "bob.jones@nvidia.com", "greeting_name": "Bob"},
            {"email": "carol.ng@nvidia.com", "greeting_name": "Carol"},
            {"email": "dan.wu@nvidia.com", "greeting_name": "Dan"},
            {"email": "eve.lee@nvidia.com", "greeting_name": "Eve"},
            {"email": "frank.kim@nvidia.com", "greeting_name": "Frank"},
        ]
        first = send.select_preview_recipients(candidates)
        second = send.select_preview_recipients(list(reversed(candidates)))
        self.assertEqual(
            [c["email"] for c in first],
            [c["email"] for c in second],
        )

    def test_discover_preview_candidates_uses_cache_on_repeat(self) -> None:
        calls = 0

        def fake_discover_serpapi(q: str, domain: str, api_key: str):
            nonlocal calls
            calls += 1
            return [
                {
                    "email": f"recruiter{calls}@nvidia.com",
                    "greeting_name": f"Recruiter{calls}",
                }
            ]

        with (
            patch.object(send, "serpapi_api_key", return_value="test-key"),
            patch.object(send, "domain_for_company", return_value="nvidia.com"),
            patch.object(send, "_discover_serpapi", side_effect=fake_discover_serpapi),
        ):
            first = send.discover_preview_candidates("Nvidia")
            calls_after_first = calls
            second = send.discover_preview_candidates("Nvidia")

        self.assertEqual(
            sorted(c["email"] for c in first),
            sorted(c["email"] for c in second),
        )
        self.assertGreater(calls_after_first, 0)
        self.assertEqual(calls, calls_after_first)

    def test_discover_preview_candidates_shuffles_cached_order(self) -> None:
        pool = [
            {"email": f"recruiter{i}@nvidia.com", "greeting_name": f"R{i}"}
            for i in range(8)
        ]
        key = send._preview_discovery_cache_key(
            "Nvidia",
            school_name=None,
            school_normalized=None,
        )
        send._preview_discovery_cache[key] = pool

        orders = {
            tuple(c["email"] for c in send.discover_preview_candidates("Nvidia"))
            for _ in range(24)
        }
        self.assertGreater(len(orders), 1)


if __name__ == "__main__":
    unittest.main()
