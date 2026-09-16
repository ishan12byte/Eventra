#!/usr/bin/env python3
"""
Test Runner for Distributed Event Processing System
Runs all unit and integration tests using Python's built-in unittest framework.
"""
import sys
import unittest

if __name__ == "__main__":
    print("=" * 70)
    print(" Running Distributed Event Processing System Test Suite")
    print("=" * 70)
    
    loader = unittest.TestLoader()
    suite = loader.discover("backend/tests")
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("\n" + "=" * 70)
    if result.wasSuccessful():
        print(f" ALL {result.testsRun} TESTS PASSED SUCCESSFULLY!")
    else:
        print(f" TESTS FAILED: {len(result.failures)} failures, {len(result.errors)} errors out of {result.testsRun} tests.")
    print("=" * 70)
    
    sys.exit(0 if result.wasSuccessful() else 1)
