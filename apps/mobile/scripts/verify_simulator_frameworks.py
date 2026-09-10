"""Reject simulator packages containing physical-device native assets."""
from pathlib import Path
import subprocess
import sys


def verify(app: Path):
    frameworks = app / "Frameworks"
    binaries = [app / "Runner"] + [p / p.stem for p in frameworks.glob("*.framework")]
    if not (frameworks / "objective_c.framework" / "objective_c").is_file():
        raise RuntimeError("objective_c native asset is missing")
    for binary in binaries:
        result = subprocess.run(["xcrun", "vtool", "-show-build", str(binary)], capture_output=True, text=True, check=True)
        platforms = [line.split()[-1] for line in result.stdout.splitlines() if line.strip().startswith("platform ")]
        if not platforms or any(p != "IOSSIMULATOR" for p in platforms):
            raise RuntimeError(f"{binary}: expected IOSSIMULATOR, got {platforms}")
    print(f"PASS: {len(binaries)} simulator binaries verified")


if __name__ == "__main__":
    verify(Path(sys.argv[1]))
