"""Packaging + Utilities seed data.

Areas + equipment for the Packaging and Utilities departments.
Process department data lives in `factory_data.py` (unchanged).
"""
from typing import List, Dict, Any


def E(code, name, kind="machine", mtype="mechanical"):
    """Equipment entry (no subsystems/parallel groups for packaging/utilities)."""
    return {"code": code, "name": name, "kind": kind,
            "group": None, "parent": None, "is_packing": False,
            "machine_type": mtype}


# ============ PACKAGING DEPARTMENT ============
# Ranges are inclusive per spec.

def _bag_makers(prefix: str, start: int, end: int) -> List[Dict[str, Any]]:
    return [E(f"{prefix}-BAG{n:03d}", f"Bag Maker {n:02d}", mtype="mechanical")
            for n in range(start, end + 1)]


def _weighers(prefix: str, start: int, end: int) -> List[Dict[str, Any]]:
    """Weighers come in pairs (01/02, 03/04, ...). One entity per pair."""
    out = []
    n = start
    while n + 1 <= end:
        code = f"{prefix}-WGH{n:03d}-{n+1:03d}"
        name = f"Weigher {n:02d}/{n+1:02d}"
        out.append(E(code, name, mtype="instrumentation"))
        n += 2
    return out


PACKAGING_AREAS: Dict[str, Dict[str, Any]] = {
    "PC21": {
        "name": "PC21 — Packaging",
        "seq": 1,
        "machines": [
            *_bag_makers("PK-PC21", 1, 20),
            *_weighers("PK-PC21", 1, 20),
            E("PK-PC21-PCONV",  "Product Conveyors",   mtype="mechanical"),
            E("PK-PC21-RCONV",  "Return Conveyors",    mtype="mechanical"),
            E("PK-PC21-XFEED",  "Cross Feeders",       mtype="mechanical"),
            E("PK-PC21-TAP",    "Tapping Machine",     mtype="mechanical"),
            E("PK-PC21-CASE",   "Case Line Conveyors", mtype="mechanical"),
        ],
    },
    "PC32": {
        "name": "PC32 — Packaging",
        "seq": 2,
        "machines": [
            *_bag_makers("PK-PC32", 91, 108),
            *_weighers("PK-PC32", 91, 108),
            E("PK-PC32-PCONV",  "Product Conveyors",   mtype="mechanical"),
            E("PK-PC32-XFEED",  "Cross Feeders",       mtype="mechanical"),
            E("PK-PC32-TAP",    "Tapping Machine",     mtype="mechanical"),
            E("PK-PC32-CASE",   "Case Line Conveyors", mtype="mechanical"),
        ],
    },
    "PC36": {
        "name": "PC36 — Packaging",
        "seq": 3,
        "machines": [
            *_bag_makers("PK-PC36", 59, 90),
            *_weighers("PK-PC36", 59, 90),
            E("PK-PC36-PCONV",  "Product Conveyors",   mtype="mechanical"),
            E("PK-PC36-XFEED",  "Cross Feeders",       mtype="mechanical"),
            E("PK-PC36-CASE",   "Case Line Conveyors", mtype="mechanical"),
        ],
    },
    "KKR": {"name": "KKR — Packaging", "seq": 4, "machines": []},
    "TWZ": {"name": "TWZ — Packaging", "seq": 5, "machines": []},
    "BCP": {"name": "BCP — Packaging", "seq": 6, "machines": []},
    # Palletizer modules A..G — one area per module for granular downtime tracking
    **{
        f"PALLET-{letter}": {
            "name": f"Palletizer Module {letter}",
            "seq": 7 + i,
            "machines": [E(f"PK-PALLET-{letter}", f"Palletizer {letter}", mtype="mechanical")],
        }
        for i, letter in enumerate(["A", "B", "C", "D", "E", "F", "G"])
    },
}


# ============ UTILITIES DEPARTMENT ============
UTILITIES_AREAS: Dict[str, Dict[str, Any]] = {
    "UT-CAN": {
        "name": "Compressed Air & Nitrogen",
        "seq": 1,
        "machines": [
            E("UT-CAN-COMP1", "Air Compressor 1", mtype="mechanical"),
            E("UT-CAN-COMP2", "Air Compressor 2", mtype="mechanical"),
            E("UT-CAN-COMP3", "Air Compressor 3", mtype="mechanical"),
            E("UT-CAN-DRY1",  "Dryer 1",          mtype="mechanical"),
            E("UT-CAN-DRY2",  "Dryer 2",          mtype="mechanical"),
            E("UT-CAN-N2-1",  "Nitrogen Plant 1", mtype="process"),
            E("UT-CAN-N2-2",  "Nitrogen Plant 2", mtype="process"),
        ],
    },
    "UT-COOL": {
        "name": "Cooling Systems",
        "seq": 2,
        "machines": [
            E("UT-COOL-CH1",  "Chiller 1",             mtype="mechanical"),
            E("UT-COOL-CH2",  "Chiller 2",             mtype="mechanical"),
            E("UT-COOL-CH3",  "Chiller 3",             mtype="mechanical"),
            E("UT-COOL-CWP1", "Chilled Water Pump 1",  mtype="mechanical"),
            E("UT-COOL-CWP2", "Chilled Water Pump 2",  mtype="mechanical"),
            E("UT-COOL-CWP3", "Chilled Water Pump 3",  mtype="mechanical"),
            E("UT-COOL-OPTX-CH1", "Optyx Chiller 1",   mtype="mechanical"),
            E("UT-COOL-OPTX-CH2", "Optyx Chiller 2",   mtype="mechanical"),
            E("UT-COOL-OPTX-P1",  "Optyx Pump 1",      mtype="mechanical"),
            E("UT-COOL-OPTX-P2",  "Optyx Pump 2",      mtype="mechanical"),
        ],
    },
    "UT-ELEC": {
        "name": "Electrical Infrastructure",
        "seq": 3,
        "machines": [
            E("UT-ELEC-UPS1", "UPS System 1", mtype="electrical"),
            E("UT-ELEC-UPS2", "UPS System 2", mtype="electrical"),
            E("UT-ELEC-TXF1", "Transformer 1", mtype="electrical"),
            E("UT-ELEC-TXF2", "Transformer 2", mtype="electrical"),
            E("UT-ELEC-HT1",  "HT Breaker 1",  mtype="electrical"),
            E("UT-ELEC-HT2",  "HT Breaker 2",  mtype="electrical"),
            E("UT-ELEC-PCC1", "PCC Panel 1",   mtype="electrical"),
            E("UT-ELEC-PCC2", "PCC Panel 2",   mtype="electrical"),
            E("UT-ELEC-MCC1", "MCC Panel 1",   mtype="electrical"),
            E("UT-ELEC-MCC2", "MCC Panel 2",   mtype="electrical"),
            E("UT-ELEC-APFC1","APFC Panel 1",  mtype="electrical"),
            E("UT-ELEC-APFC2","APFC Panel 2",  mtype="electrical"),
        ],
    },
    "UT-PWR": {
        "name": "Power Generation",
        "seq": 4,
        "machines": [
            E("UT-PWR-DG1",  "DG Set 1", mtype="mechanical"),
            E("UT-PWR-DG2",  "DG Set 2", mtype="mechanical"),
            E("UT-PWR-DG3",  "DG Set 3", mtype="mechanical"),
            E("UT-PWR-BIO",  "Bio Engine", mtype="mechanical"),
        ],
    },
    "UT-INFRA": {
        "name": "Plant Infrastructure",
        "seq": 5,
        "machines": [
            E("UT-INFRA-AHU1", "AHU 1", mtype="mechanical"),
            E("UT-INFRA-AHU2", "AHU 2", mtype="mechanical"),
            E("UT-INFRA-AHU3", "AHU 3", mtype="mechanical"),
            E("UT-INFRA-VENT1","Ventilation Unit 1", mtype="mechanical"),
            E("UT-INFRA-VENT2","Ventilation Unit 2", mtype="mechanical"),
            E("UT-INFRA-ROOF1","Roof Extractor 1", mtype="mechanical"),
            E("UT-INFRA-ROOF2","Roof Extractor 2", mtype="mechanical"),
            E("UT-INFRA-ACHE1","ACHE Unit 1", mtype="mechanical"),
            E("UT-INFRA-ACHE2","ACHE Unit 2", mtype="mechanical"),
        ],
    },
    "UT-WATER": {
        "name": "Water Systems",
        "seq": 6,
        "machines": [
            E("UT-WATER-WTP", "WTP — Water Treatment Plant", mtype="process"),
            E("UT-WATER-WRS", "WRS — Water Recovery System", mtype="process"),
            E("UT-WATER-ETP", "ETP — Effluent Treatment Plant", mtype="process"),
            E("UT-WATER-SRP", "Starch Recovery Plant", mtype="process"),
        ],
    },
    "UT-BOIL": {
        "name": "Boiler Systems",
        "seq": 7,
        "machines": [
            E("UT-BOIL-15",   "15 TPH Boiler", mtype="process"),
            E("UT-BOIL-20",   "20 TPH Boiler", mtype="process"),
            E("UT-BOIL-STEAM","Steam Distribution Header", mtype="process"),
            E("UT-BOIL-COND", "Condensate Recovery System", mtype="process"),
        ],
    },
}


# ============ EXTRA FAILURE MODES ============
UTILITIES_FAILURE_MODES = [
    ("FM-UT-ELEC",   "Electrical Fault",       "electrical"),
    ("FM-UT-MECH",   "Mechanical Fault",       "mechanical"),
    ("FM-UT-INST",   "Instrumentation Fault",  "instrumentation"),
    ("FM-UT-STEAM",  "Steam / Temperature",    "utility"),
    ("FM-UT-PWRFAIL","Power Failure",          "utility"),
    ("FM-UT-PWRFLC", "Power Fluctuation",      "utility"),
    ("FM-UT-BOILER", "Boiler Issue",           "utility"),
    ("FM-UT-WRS",    "WRS Issue",              "utility"),
    ("FM-UT-DG",     "DG Issue",               "utility"),
    ("FM-UT-AIRN2",  "Compressed Air / Nitrogen", "utility"),
    ("FM-UT-STEAM-PRESS", "Steam Pressure Issue",  "utility"),
    ("FM-UT-COND-CHOKE",  "Condensate Choking",    "utility"),
    ("FM-UT-TEMP",   "Temperature Issue",      "utility"),
]

PACKAGING_FAILURE_MODES = [
    ("FM-PK-BAG-SEAL",  "Bag Seal / Cutter",     "mechanical"),
    ("FM-PK-BAG-FILM",  "Film Feed / Splice",    "mechanical"),
    ("FM-PK-WGH-CAL",   "Weigher Calibration",   "instrumentation"),
    ("FM-PK-WGH-JAM",   "Weigher Bucket Jam",    "mechanical"),
    ("FM-PK-CONV-BELT", "Conveyor Belt / Roller","mechanical"),
    ("FM-PK-CFEED",     "Cross Feeder Jam",      "mechanical"),
    ("FM-PK-TAPE",      "Tape / Tapping Fault",  "mechanical"),
    ("FM-PK-PALLET",    "Palletizer Fault",      "mechanical"),
]
