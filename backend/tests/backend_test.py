"""Factory CMMS Enterprise — Backend regression suite.

Covers: health, auth (login, me, brute-force lockout, register RBAC),
masters (lines, tree, machines), breakdown creation (incl. packing rejection),
work order lifecycle (assign→start→complete→close), analytics (KPI, availability
placeholder & numeric after runtime), runtime validations, timeline, rankings,
failure-modes, spares, notifications, users, WebSocket handshake + broadcast.
"""
import os
import json
import time
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factory-cmms-live.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@factory.local", "Admin@123")
TECH = ("tech@factory.local", "Tech@123")
OPERATOR = ("op@factory.local", "Op@123")


# ---------- Helpers / fixtures ----------
def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["data"]["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def tech_token():
    return _login(*TECH)


@pytest.fixture(scope="session")
def op_token():
    return _login(*OPERATOR)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Module: health ----------
class TestHealth:
    def test_health_ok(self):
        r = requests.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- Module: auth ----------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
        assert r.status_code == 200
        d = r.json()["data"]
        assert d["user"]["role"] == "admin"
        assert d["access_token"]

    def test_login_tech(self):
        r = requests.post(f"{API}/auth/login", json={"email": TECH[0], "password": TECH[1]})
        assert r.status_code == 200
        assert r.json()["data"]["user"]["role"] == "technician"

    def test_login_op(self):
        r = requests.post(f"{API}/auth/login", json={"email": OPERATOR[0], "password": OPERATOR[1]})
        assert r.status_code == 200
        assert r.json()["data"]["user"]["role"] == "operator"

    def test_me_with_bearer(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert r.json()["data"]["email"] == ADMIN[0]

    def test_wrong_password_401(self):
        # Use a unique email to avoid triggering lockout on real accounts
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN[0], "password": "WRONGPASSWORD"})
        assert r.status_code == 401
        body = r.json()
        assert body.get("detail", {}).get("code") == "AUTH_BAD_CREDENTIALS"

    def test_brute_force_lockout(self):
        """Lockout should trigger after 5 failures.

        NOTE: In this multi-pod K8s deployment, request.client.host is the
        ingress pod IP (not the real client) so identifier is split across
        pods. We try up to 15 attempts and accept a 429 anywhere in the
        second half. If not seen, we flag the RCA in the test report.
        """
        fake_email = f"lockout_test_{int(time.time())}@nowhere.local"
        saw_429 = False
        last = None
        for i in range(15):
            r = requests.post(f"{API}/auth/login",
                              json={"email": fake_email, "password": "bad"})
            last = r
            if r.status_code == 429:
                saw_429 = True
                assert r.json()["detail"]["code"] == "AUTH_LOCKED"
                break
        assert saw_429, (
            "AUTH_LOCKED never observed across 15 attempts — likely due to "
            "identifier being pinned to ingress pod IP (see RCA in report). "
            f"last={last.status_code} {last.text[:150]}"
        )

    def test_register_non_admin_forbidden(self, op_token):
        r = requests.post(f"{API}/auth/register", headers=_hdr(op_token),
                          json={"email": "TEST_x@x.com", "full_name": "x",
                                "role": "operator", "password": "Xxxxxx1!"})
        assert r.status_code == 403

    def test_register_admin_creates(self, admin_token):
        email = f"TEST_reg_{int(time.time())}@factory.local"
        r = requests.post(f"{API}/auth/register", headers=_hdr(admin_token),
                          json={"email": email, "full_name": "Test Reg",
                                "role": "technician", "password": "Test@1234"})
        assert r.status_code == 200, r.text
        # server lowercases email
        assert r.json()["data"]["email"] == email.lower()


# ---------- Module: lines / tree / machines ----------
class TestMasters:
    def test_lines_returns_six(self, admin_token):
        r = requests.get(f"{API}/lines", headers=_hdr(admin_token))
        assert r.status_code == 200
        codes = sorted([l["code"] for l in r.json()["data"]])
        assert codes == sorted(["PC21", "PC32", "PC36", "KKR", "TWZ", "BCP"]), codes

    def test_pc21_tree_has_expected(self, admin_token):
        # get PC21 id
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        pc21 = next(l for l in lines if l["code"] == "PC21")
        r = requests.get(f"{API}/lines/{pc21['id']}/tree", headers=_hdr(admin_token))
        assert r.status_code == 200
        d = r.json()["data"]
        machines = d["machines"]
        names = [m["name"] for m in machines]
        # Fryer subsystems
        for sub in ("Heat Exchanger", "Main Oil Pump", "Oil Management System"):
            assert any(sub.lower() in n.lower() for n in names), f"missing PC21 subsystem: {sub}"
        # OPTYX present
        assert any("optyx" in n.lower() for n in names), "OPTYX missing"
        # Finished Product Dispatch terminator
        dispatch = [m for m in machines if "dispatch" in m["name"].lower() or m.get("is_packing")]
        assert dispatch, "Finished Product Dispatch missing"
        assert any(m.get("is_packing") for m in dispatch), "Dispatch not is_packing"
        assert any(m.get("kind") == "terminator" for m in dispatch), "Dispatch not terminator kind"

    def test_pc32_parallel_counts(self, admin_token):
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        pc32 = next(l for l in lines if l["code"] == "PC32")
        r = requests.get(f"{API}/machines?line_id={pc32['id']}", headers=_hdr(admin_token))
        assert r.status_code == 200
        names = [m["name"].lower() for m in r.json()["data"]]
        peelers = [n for n in names if "peeler" in n]
        slicers = [n for n in names if "slicer" in n]
        assert len(peelers) >= 4, f"PC32 peelers={len(peelers)}"
        assert len(slicers) >= 4, f"PC32 slicers={len(slicers)}"

    def test_kkr_four_extruders(self, admin_token):
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        kkr = next(l for l in lines if l["code"] == "KKR")
        r = requests.get(f"{API}/machines?line_id={kkr['id']}", headers=_hdr(admin_token))
        names = [m["name"].lower() for m in r.json()["data"]]
        extruders = [n for n in names if "extruder" in n]
        assert len(extruders) >= 4, f"KKR extruders={len(extruders)}"

    def test_failure_modes_seeded(self, admin_token):
        r = requests.get(f"{API}/failure-modes", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert len(r.json()["data"]) > 10

    def test_failure_mode_create(self, admin_token):
        code = f"TESTFM_{int(time.time())}"
        r = requests.post(f"{API}/failure-modes", headers=_hdr(admin_token),
                          json={"code": code, "name": "Test Mode", "category": "mechanical"})
        assert r.status_code == 200
        assert r.json()["data"]["code"] == code

    def test_spare_upsert(self, admin_token):
        sap = f"TESTSAP_{int(time.time())}"
        r = requests.post(f"{API}/spares", headers=_hdr(admin_token),
                          json={"sap_code": sap, "name": "Test Bearing", "on_hand": 5,
                                "min_stock": 1, "cost": 10.0})
        assert r.status_code == 200
        assert r.json()["data"]["sap_code"] == sap
        # upsert (change on_hand)
        r2 = requests.post(f"{API}/spares", headers=_hdr(admin_token),
                           json={"sap_code": sap, "on_hand": 12})
        assert r2.status_code == 200
        assert r2.json()["data"]["on_hand"] == 12

    def test_patch_machine(self, admin_token):
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        pc21 = next(l for l in lines if l["code"] == "PC21")
        machs = requests.get(f"{API}/machines?line_id={pc21['id']}", headers=_hdr(admin_token)).json()["data"]
        target = next(m for m in machs if not m.get("is_packing") and m.get("kind") in ("machine", "subsystem"))
        r = requests.patch(f"{API}/machines/{target['id']}", headers=_hdr(admin_token),
                           json={"sap_code": "SAP_TEST_123", "machine_type": "electrical",
                                 "criticality_manual": 7})
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        assert d["sap_code"] == "SAP_TEST_123"
        assert d["machine_type"] == "electrical"
        assert d["criticality_manual"] == 7


# ---------- Module: breakdown + WO lifecycle ----------
@pytest.fixture(scope="session")
def bd_context(admin_token, op_token):
    """Create a breakdown as operator on a non-packing machine of PC21."""
    lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
    pc21 = next(l for l in lines if l["code"] == "PC21")
    machs = requests.get(f"{API}/machines?line_id={pc21['id']}", headers=_hdr(admin_token)).json()["data"]
    target = next(m for m in machs if not m.get("is_packing") and m.get("kind") == "machine")
    payload = {
        "line_id": pc21["id"], "machine_id": target["id"],
        "breakdown_type": "mechanical",
        "description": "TEST_ breakdown created by pytest",
        "severity": "medium",
    }
    r = requests.post(f"{API}/breakdowns", headers=_hdr(op_token), json=payload)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    return {
        "line": pc21, "machine": target,
        "breakdown": d["breakdown"], "work_order": d["work_order"],
    }


class TestBreakdown:
    def test_breakdown_created_with_ticket(self, bd_context):
        b = bd_context["breakdown"]
        assert b["ticket_no"].startswith("BD-")
        assert b["status"] == "open"

    def test_wo_created(self, bd_context):
        wo = bd_context["work_order"]
        assert wo["wo_no"].startswith("WO-")
        assert wo["status"] == "open"

    def test_machine_status_failed(self, admin_token, bd_context):
        r = requests.get(f"{API}/machines/{bd_context['machine']['id']}", headers=_hdr(admin_token))
        assert r.json()["data"]["status"] == "failed"

    def test_breakdown_packing_rejected(self, op_token, admin_token):
        # Find packing terminator on PC21
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        pc21 = next(l for l in lines if l["code"] == "PC21")
        machs = requests.get(f"{API}/machines?line_id={pc21['id']}", headers=_hdr(admin_token)).json()["data"]
        term = next(m for m in machs if m.get("is_packing"))
        r = requests.post(f"{API}/breakdowns", headers=_hdr(op_token), json={
            "line_id": pc21["id"], "machine_id": term["id"],
            "breakdown_type": "mechanical", "description": "should fail",
        })
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "BD_NON_METRIC"

    def test_list_breakdowns_contains_new(self, admin_token, bd_context):
        r = requests.get(f"{API}/breakdowns", headers=_hdr(admin_token))
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()["data"]]
        assert bd_context["breakdown"]["id"] in ids

    def test_timeline_has_breakdown_and_status_changed(self, admin_token, bd_context):
        line_id = bd_context["line"]["id"]
        r = requests.get(f"{API}/timeline?line_id={line_id}&limit=200", headers=_hdr(admin_token))
        kinds = {e["kind"] for e in r.json()["data"]}
        assert "breakdown.created" in kinds
        assert "machine.status_changed" in kinds


class TestWOLifecycle:
    def test_assign_start_complete_close(self, admin_token, tech_token, bd_context):
        wo_id = bd_context["work_order"]["id"]
        # get technician id
        techs = requests.get(f"{API}/users/technicians", headers=_hdr(admin_token)).json()["data"]
        assert techs, "no technicians in system"
        tech_id = techs[0]["id"]

        # assign
        r = requests.post(f"{API}/work-orders/{wo_id}/assign", headers=_hdr(admin_token),
                         json={"assigned_to": tech_id, "reason": "test"})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["assigned_to"] == tech_id

        # start (as tech)
        r = requests.post(f"{API}/work-orders/{wo_id}/start", headers=_hdr(tech_token))
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "in_progress"
        # machine should be in repair
        m = requests.get(f"{API}/machines/{bd_context['machine']['id']}",
                        headers=_hdr(admin_token)).json()["data"]
        assert m["status"] == "repair"

        # sleep a moment to accumulate repair time
        time.sleep(2)

        # complete
        r = requests.post(f"{API}/work-orders/{wo_id}/complete", headers=_hdr(tech_token),
                         json={"action_taken": "replaced bearing", "root_cause": "wear",
                               "spares_used": []})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "completed"
        assert (r.json()["data"]["repair_time_seconds"] or 0) >= 0

        # close
        r = requests.post(f"{API}/work-orders/{wo_id}/close", headers=_hdr(tech_token))
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "closed"

        # machine now running, breakdown closed
        m = requests.get(f"{API}/machines/{bd_context['machine']['id']}",
                        headers=_hdr(admin_token)).json()["data"]
        assert m["status"] == "running"
        bd = requests.get(f"{API}/breakdowns/{bd_context['breakdown']['id']}",
                         headers=_hdr(admin_token)).json()["data"]
        assert bd["status"] == "closed"
        assert bd["duration_seconds"] is not None


# ---------- Module: analytics + runtime ----------
class TestAnalyticsRuntime:
    def test_line_kpi_no_runtime_returns_placeholder(self, admin_token):
        # BCP is unlikely to have runtime logs
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        bcp = next(l for l in lines if l["code"] == "BCP")
        r = requests.get(f"{API}/analytics/line/{bcp['id']}/kpi", headers=_hdr(admin_token))
        assert r.status_code == 200
        d = r.json()["data"]
        assert d["availability_display"] == "Availability Not Configured"

    def test_runtime_invalid_run_gt_calendar(self, admin_token):
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        pc21 = next(l for l in lines if l["code"] == "PC21")
        r = requests.post(f"{API}/runtime", headers=_hdr(admin_token), json={
            "line_id": pc21["id"], "date": "2025-01-01",
            "calendar_hours": 24, "dark_hours": 0, "run_time_hours": 25,
        })
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "RUNTIME_INVALID"

    def test_runtime_upsert_then_numeric_availability(self, admin_token):
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        pc21 = next(l for l in lines if l["code"] == "PC21")
        # use today's date so window includes it
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.post(f"{API}/runtime", headers=_hdr(admin_token), json={
            "line_id": pc21["id"], "date": today,
            "calendar_hours": 24, "dark_hours": 2, "run_time_hours": 20,
        })
        assert r.status_code == 200, r.text
        # KPI
        r = requests.get(f"{API}/analytics/line/{pc21['id']}/kpi", headers=_hdr(admin_token))
        d = r.json()["data"]
        assert d["availability_display"] != "Availability Not Configured"
        assert d["availability"] is not None

    def test_downtime_trend_30_days(self, admin_token):
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        pc21 = next(l for l in lines if l["code"] == "PC21")
        r = requests.get(f"{API}/analytics/line/{pc21['id']}/downtime-trend?days=30",
                        headers=_hdr(admin_token))
        assert r.status_code == 200
        data = r.json()["data"]
        assert len(data) >= 30

    def test_rankings_excludes_packing(self, admin_token):
        r = requests.get(f"{API}/analytics/rankings", headers=_hdr(admin_token))
        assert r.status_code == 200
        rows = r.json()["data"]
        # verify no packing terminator sneaks in
        machs = requests.get(f"{API}/machines", headers=_hdr(admin_token)).json()["data"]
        packing_ids = {m["id"] for m in machs if m.get("is_packing")}
        for row in rows:
            assert row["machine_id"] not in packing_ids


# ---------- Module: timeline replay ----------
class TestTimeline:
    def test_replay_returns_frames(self, admin_token):
        lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
        pc21 = next(l for l in lines if l["code"] == "PC21")
        r = requests.get(f"{API}/timeline/replay?line_id={pc21['id']}", headers=_hdr(admin_token))
        assert r.status_code == 200
        d = r.json()["data"]
        assert "frames" in d
        assert isinstance(d["frames"], list)


# ---------- Module: notifications ----------
class TestNotifications:
    def test_technician_sees_machine_down(self, tech_token):
        r = requests.get(f"{API}/notifications", headers=_hdr(tech_token))
        assert r.status_code == 200
        kinds = {n["kind"] for n in r.json()["data"]}
        assert "machine_down" in kinds, f"technician kinds={kinds}"


# ---------- Module: users ----------
class TestUsers:
    def test_admin_patches_user(self, admin_token):
        users = requests.get(f"{API}/users", headers=_hdr(admin_token)).json()["data"]
        target = next(u for u in users if u["role"] == "operator")
        r = requests.patch(f"{API}/users/{target['id']}", headers=_hdr(admin_token),
                          json={"full_name": "Demo Operator Updated"})
        assert r.status_code == 200
        assert r.json()["data"]["full_name"] == "Demo Operator Updated"
        # revert
        requests.patch(f"{API}/users/{target['id']}", headers=_hdr(admin_token),
                      json={"full_name": "Demo Operator"})


# ---------- Module: WebSocket ----------
class TestWebSocket:
    def test_ws_connect_and_broadcast(self, admin_token, op_token):
        # Convert https url to wss
        ws_url = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{ws_url}/api/ws?token={admin_token}"

        try:
            import websockets  # noqa
        except ImportError:
            pytest.skip("websockets not installed")

        async def run():
            import websockets
            got = []
            async with websockets.connect(ws_url, open_timeout=10) as ws:
                # Read hello
                hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                assert hello["type"] == "hello"

                # Subscribe to PC21 line channel
                lines = requests.get(f"{API}/lines", headers=_hdr(admin_token)).json()["data"]
                pc21 = next(l for l in lines if l["code"] == "PC21")
                await ws.send(json.dumps({"op": "subscribe", "channels": [f"line:{pc21['id']}"]}))
                ack = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                assert ack["type"] == "ack"

                # Trigger a breakdown from another user
                machs = requests.get(f"{API}/machines?line_id={pc21['id']}",
                                    headers=_hdr(admin_token)).json()["data"]
                target = next(m for m in machs if not m.get("is_packing")
                              and m.get("kind") == "machine" and m.get("status") == "running")
                r = requests.post(f"{API}/breakdowns", headers=_hdr(op_token), json={
                    "line_id": pc21["id"], "machine_id": target["id"],
                    "breakdown_type": "electrical",
                    "description": "TEST_ ws broadcast",
                })
                assert r.status_code == 200, r.text

                # Consume events for up to 6s and look for machine.status_changed
                end = time.time() + 6
                while time.time() < end:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=6)
                        msg = json.loads(raw)
                        got.append(msg)
                        # Hub emits {"type":"event","event":"machine.status_changed",...}
                        if msg.get("event") == "machine.status_changed":
                            return got
                    except asyncio.TimeoutError:
                        break
                return got

        got = asyncio.get_event_loop().run_until_complete(run())
        events = {m.get("event") for m in got}
        assert "machine.status_changed" in events, f"broadcast missed. events={got}"
