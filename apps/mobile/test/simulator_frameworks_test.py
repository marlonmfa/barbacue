import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('simulator_verify', Path(__file__).parents[1] / 'scripts/verify_simulator_frameworks.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SimulatorPackageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app = Path(self.temp.name) / 'Runner.app'
        self.library = self.app / 'Frameworks/objective_c.framework/objective_c'
        self.library.parent.mkdir(parents=True)
        self.library.touch()

    def test_rejects_device_library_in_simulator_package(self):
        def inspect(args, **kwargs):
            platform = 'IOS' if args[-1] == str(self.library) else 'IOSSIMULATOR'
            return subprocess.CompletedProcess(args, 0, f' platform {platform}\n', '')
        with patch.object(module.subprocess, 'run', side_effect=inspect):
            with self.assertRaisesRegex(RuntimeError, 'expected IOSSIMULATOR'):
                module.verify(self.app)

    def test_accepts_consistent_simulator_package(self):
        result = subprocess.CompletedProcess([], 0, ' platform IOSSIMULATOR\n', '')
        with patch.object(module.subprocess, 'run', return_value=result):
            module.verify(self.app)

    def test_rejects_missing_required_native_asset(self):
        self.library.unlink()
        with self.assertRaisesRegex(RuntimeError, 'native asset is missing'):
            module.verify(self.app)

if __name__ == '__main__':
    unittest.main()
