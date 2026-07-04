"""Static factory hierarchy definitions for the 6 lines.

Structure per line:
  [
    (code, name, kind, group_code_or_None, parent_code_or_None, is_packing, machine_type),
    ...
  ]

Rules enforced by validation:
- OPTYX follows Fryer
- Rospen Hopper precedes Seasoning Tumbler
- Auto Halver follows Peeling
- Heat Exchanger / Main Oil Pump / Oil Management System are Fryer subsystems
- Peelers/Slicers/Extruders 1..N are parallel siblings inside their stage
- Finished Product Dispatch marked is_packing=True → excluded from analytics
"""
from typing import List, Dict, Any

# helper to build entries
def M(code, name, kind="machine", group=None, parent=None, is_packing=False, mtype="mechanical"):
    return {"code": code, "name": name, "kind": kind, "group": group,
            "parent": parent, "is_packing": is_packing, "machine_type": mtype}


PC21: List[Dict[str, Any]] = [
    M("PC21-INFEED", "Raw Potato Infeed", mtype="mechanical"),
    M("PC21-WASH",   "Drum Washer",       mtype="mechanical"),
    M("PC21-PEEL-GRP", "Peeling Stage", kind="stage"),
    M("PC21-PEEL",   "Peeler",            group="PC21-PEEL-GRP", mtype="mechanical"),
    M("PC21-HALV",   "Auto Halver",       mtype="mechanical"),
    M("PC21-SLICE-GRP", "Slicing Stage", kind="stage"),
    M("PC21-SLICE",  "Slicer",            group="PC21-SLICE-GRP", mtype="mechanical"),
    M("PC21-TRIM",   "Trim & Pare Conveyor", kind="conveyor", mtype="mechanical"),
    M("PC21-FRY",    "Fryer",             mtype="process"),
    M("PC21-HX",     "Heat Exchanger",    kind="subsystem", parent="PC21-FRY", mtype="process"),
    M("PC21-OILPUMP","Main Oil Pump",     kind="subsystem", parent="PC21-FRY", mtype="mechanical"),
    M("PC21-OMS",    "Oil Management System", kind="subsystem", parent="PC21-FRY", mtype="process"),
    M("PC21-OPTYX",  "OPTYX",             mtype="instrumentation"),
    M("PC21-OPTIN",  "OPTYX Infeed Conveyor",  kind="subsystem", parent="PC21-OPTYX", mtype="mechanical"),
    M("PC21-OPTREJ", "OPTYX Reject Conveyor",  kind="subsystem", parent="PC21-OPTYX", mtype="mechanical"),
    M("PC21-OPTOUT", "OPTYX Outfeed Conveyor", kind="subsystem", parent="PC21-OPTYX", mtype="mechanical"),
    M("PC21-ROSPEN", "Rospen Hopper",     mtype="mechanical"),
    M("PC21-SEAS",   "Seasoning Tumbler", mtype="mechanical"),
    M("PC21-DISP",   "Finished Product Dispatch", kind="terminator", is_packing=True, mtype="terminator"),
]

# For PC32: 4 peelers + 4 slicers (parallel)
PC32: List[Dict[str, Any]] = [
    M("PC32-CRATE",  "Crate Dumper",      mtype="mechanical"),
    M("PC32-WASH",   "Barrel Washer",     mtype="mechanical"),
    M("PC32-PEEL-GRP","Peeling Stage",    kind="stage"),
    M("PC32-PEEL-1", "Peeler 1",          group="PC32-PEEL-GRP", mtype="mechanical"),
    M("PC32-PEEL-2", "Peeler 2",          group="PC32-PEEL-GRP", mtype="mechanical"),
    M("PC32-PEEL-3", "Peeler 3",          group="PC32-PEEL-GRP", mtype="mechanical"),
    M("PC32-PEEL-4", "Peeler 4",          group="PC32-PEEL-GRP", mtype="mechanical"),
    M("PC32-HALV",   "Auto Halver",       mtype="mechanical"),
    M("PC32-SLICE-GRP","Slicing Stage",   kind="stage"),
    M("PC32-SLICE-1","Slicer 1",          group="PC32-SLICE-GRP", mtype="mechanical"),
    M("PC32-SLICE-2","Slicer 2",          group="PC32-SLICE-GRP", mtype="mechanical"),
    M("PC32-SLICE-3","Slicer 3",          group="PC32-SLICE-GRP", mtype="mechanical"),
    M("PC32-SLICE-4","Slicer 4",          group="PC32-SLICE-GRP", mtype="mechanical"),
    M("PC32-TRIM",   "Trim & Pare Conveyor", kind="conveyor", mtype="mechanical"),
    M("PC32-FRY",    "Fryer",             mtype="process"),
    M("PC32-HX",     "Heat Exchanger",    kind="subsystem", parent="PC32-FRY", mtype="process"),
    M("PC32-OILPUMP","Main Oil Pump",     kind="subsystem", parent="PC32-FRY", mtype="mechanical"),
    M("PC32-OMS",    "Oil Management System", kind="subsystem", parent="PC32-FRY", mtype="process"),
    M("PC32-OPTYX",  "OPTYX",             mtype="instrumentation"),
    M("PC32-ROSPEN", "Rospen Hopper",     mtype="mechanical"),
    M("PC32-SEAS",   "Seasoning Tumbler", mtype="mechanical"),
    M("PC32-DISP",   "Finished Product Dispatch", kind="terminator", is_packing=True, mtype="terminator"),
]

PC36: List[Dict[str, Any]] = [
    M("PC36-CRATE",  "Crate Dumper",      mtype="mechanical"),
    M("PC36-WASH",   "Barrel Washer",     mtype="mechanical"),
    M("PC36-PEEL-GRP","Peeling Stage",    kind="stage"),
    M("PC36-PEEL",   "Peeler",            group="PC36-PEEL-GRP", mtype="mechanical"),
    M("PC36-HALV",   "Auto Halver",       mtype="mechanical"),
    M("PC36-SLICE-GRP","Slicing Stage",   kind="stage"),
    M("PC36-SLICE",  "Slicer",            group="PC36-SLICE-GRP", mtype="mechanical"),
    M("PC36-TRIM",   "Trim & Pare Conveyor", kind="conveyor", mtype="mechanical"),
    M("PC36-FRY",    "Fryer",             mtype="process"),
    M("PC36-HX",     "Heat Exchanger",    kind="subsystem", parent="PC36-FRY", mtype="process"),
    M("PC36-OILPUMP","Main Oil Pump",     kind="subsystem", parent="PC36-FRY", mtype="mechanical"),
    M("PC36-OMS",    "Oil Management System", kind="subsystem", parent="PC36-FRY", mtype="process"),
    M("PC36-OPTYX",  "OPTYX",             mtype="instrumentation"),
    M("PC36-ROSPEN", "Rospen Hopper",     mtype="mechanical"),
    M("PC36-SEAS",   "Seasoning Tumbler", mtype="mechanical"),
    M("PC36-DISP",   "Finished Product Dispatch", kind="terminator", is_packing=True, mtype="terminator"),
]

KKR: List[Dict[str, Any]] = [
    M("KKR-FEED",    "Raw Material Feeding", mtype="mechanical"),
    M("KKR-BLEND",   "Blending System",   mtype="process"),
    M("KKR-EXT-GRP", "Extruder Stage",    kind="stage"),
    M("KKR-EXT-2",   "Extruder 2",        group="KKR-EXT-GRP", mtype="mechanical"),
    M("KKR-EXT-3",   "Extruder 3",        group="KKR-EXT-GRP", mtype="mechanical"),
    M("KKR-EXT-4",   "Extruder 4",        group="KKR-EXT-GRP", mtype="mechanical"),
    M("KKR-EXT-5",   "Extruder 5",        group="KKR-EXT-GRP", mtype="mechanical"),
    M("KKR-KETTLE",  "Seasoning Kettle",  mtype="process"),
    M("KKR-ROSPEN",  "Rospen Hopper",     mtype="mechanical"),
    M("KKR-SEAS",    "Seasoning Tumbler", mtype="mechanical"),
    M("KKR-DISP",    "Finished Product Dispatch", kind="terminator", is_packing=True, mtype="terminator"),
]

TWZ: List[Dict[str, Any]] = [
    M("TWZ-FEED",    "Raw Material Feeding", mtype="mechanical"),
    M("TWZ-KNEAD",   "Dough Kneader",     mtype="mechanical"),
    M("TWZ-EXT",     "Extruder",          mtype="mechanical"),
    M("TWZ-BLOW",    "Meal Transfer Blower", mtype="mechanical"),
    M("TWZ-RETEN",   "Retention Conveyor", kind="conveyor", mtype="mechanical"),
    M("TWZ-ROSPEN",  "Rospen Hopper",     mtype="mechanical"),
    M("TWZ-SEAS",    "Seasoning Tumbler", mtype="mechanical"),
    M("TWZ-DISP",    "Finished Product Dispatch", kind="terminator", is_packing=True, mtype="terminator"),
]

BCP: List[Dict[str, Any]] = [
    M("BCP-FEED",    "Raw Material Feeding", mtype="mechanical"),
    M("BCP-MTS",     "Meal Transfer System", mtype="mechanical"),
    M("BCP-EXT",     "Extruder",          mtype="mechanical"),
    M("BCP-OVEN",    "Oven",              mtype="process"),
    M("BCP-ROSPEN",  "Rospen Hopper",     mtype="mechanical"),
    M("BCP-SEAS",    "Seasoning Tumbler", mtype="mechanical"),
    M("BCP-DISP",    "Finished Product Dispatch", kind="terminator", is_packing=True, mtype="terminator"),
]

LINES = {
    "PC21": {"name": "PC21 — Slicing Line 1", "seq": 1, "machines": PC21},
    "PC32": {"name": "PC32 — Slicing Line 2", "seq": 2, "machines": PC32},
    "PC36": {"name": "PC36 — Slicing Line 3", "seq": 3, "machines": PC36},
    "KKR":  {"name": "KKR — Extruder Line",   "seq": 4, "machines": KKR},
    "TWZ":  {"name": "TWZ — Dough Line",      "seq": 5, "machines": TWZ},
    "BCP":  {"name": "BCP — Baked Line",      "seq": 6, "machines": BCP},
}


DEFAULT_FAILURE_MODES = [
    ("FM-MECH-BEAR",  "Bearing Failure",         "mechanical"),
    ("FM-MECH-BELT",  "Belt Failure / Slip",     "mechanical"),
    ("FM-MECH-CHAIN", "Chain / Sprocket Failure","mechanical"),
    ("FM-MECH-SEAL",  "Seal / Gasket Leak",      "mechanical"),
    ("FM-MECH-GEAR",  "Gearbox / Coupling",      "mechanical"),
    ("FM-ELEC-MOTOR", "Motor Failure",           "electrical"),
    ("FM-ELEC-VFD",   "VFD / Drive Fault",       "electrical"),
    ("FM-ELEC-WIRE",  "Wiring / Contactor",      "electrical"),
    ("FM-INST-SENSOR","Sensor Fault",            "instrumentation"),
    ("FM-INST-CTRL",  "Controller / PLC",        "instrumentation"),
    ("FM-PROC-TEMP",  "Temperature Deviation",   "process"),
    ("FM-PROC-CLOG",  "Blockage / Clog",         "process"),
    ("FM-UTIL-STEAM", "Steam / Utility Loss",    "utility"),
    ("FM-OPER-ERR",   "Operator Error",          "operator_error"),
    ("FM-PLAN-PM",    "Planned Maintenance",     "planned"),
    ("FM-OTHER",      "Other",                   "other"),
]
