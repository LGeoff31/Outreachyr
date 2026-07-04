from __future__ import annotations

import json
import unittest
from unittest.mock import patch

import supabase_jwt


class FakeAuthResponse:
    def __init__(self, *, email: str = "user@example.com", user_id: str = "user-1"):
        self._payload = {"email": email, "id": user_id}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return json.dumps(self._payload).encode()


class SupabaseJwtCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        supabase_jwt.clear_supabase_access_token_cache()

    def tearDown(self) -> None:
        supabase_jwt.clear_supabase_access_token_cache()

    def test_verify_supabase_access_token_caches_successful_lookup(self) -> None:
        with (
            patch.dict(
                "os.environ",
                {"SUPABASE_AUTH_CACHE_TTL_SECONDS": "60"},
                clear=False,
            ),
            patch("supabase_jwt.supabase_url", return_value="https://project.supabase.co"),
            patch("supabase_jwt.supabase_publishable_key", return_value="anon-key"),
            patch("supabase_jwt.urlopen", return_value=FakeAuthResponse()) as urlopen,
        ):
            first = supabase_jwt.verify_supabase_access_token("token-1")
            second = supabase_jwt.verify_supabase_access_token("token-1")

        self.assertEqual(first, {"email": "user@example.com", "id": "user-1"})
        self.assertEqual(second, first)
        self.assertEqual(urlopen.call_count, 1)

    def test_verify_supabase_access_token_returns_copy_of_cached_user(self) -> None:
        with (
            patch.dict(
                "os.environ",
                {"SUPABASE_AUTH_CACHE_TTL_SECONDS": "60"},
                clear=False,
            ),
            patch("supabase_jwt.supabase_url", return_value="https://project.supabase.co"),
            patch("supabase_jwt.supabase_publishable_key", return_value="anon-key"),
            patch("supabase_jwt.urlopen", return_value=FakeAuthResponse()),
        ):
            first = supabase_jwt.verify_supabase_access_token("token-1")
            first["email"] = "mutated@example.com"
            second = supabase_jwt.verify_supabase_access_token("token-1")

        self.assertEqual(second["email"], "user@example.com")

    def test_verify_supabase_access_token_cache_can_be_disabled(self) -> None:
        with (
            patch.dict(
                "os.environ",
                {"SUPABASE_AUTH_CACHE_TTL_SECONDS": "0"},
                clear=False,
            ),
            patch("supabase_jwt.supabase_url", return_value="https://project.supabase.co"),
            patch("supabase_jwt.supabase_publishable_key", return_value="anon-key"),
            patch("supabase_jwt.urlopen", return_value=FakeAuthResponse()) as urlopen,
        ):
            supabase_jwt.verify_supabase_access_token("token-1")
            supabase_jwt.verify_supabase_access_token("token-1")

        self.assertEqual(urlopen.call_count, 2)


if __name__ == "__main__":
    unittest.main()
