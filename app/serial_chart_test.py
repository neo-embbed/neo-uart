# .venv\Scripts\python.exe app\serial_chart_test.py

import math
import time

import serial


def main() -> None:
    port = "COM6"
    baudrate = 115200
    period_s = 1.0
    amplitude = 10
    offset = 0.0
    sample_hz = 50
    interval = 1.0 / sample_hz

    with serial.Serial(port=port, baudrate=baudrate, timeout=0.1) as ser:
        start = time.perf_counter()
        while True:
            t = time.perf_counter() - start
            value = offset + amplitude * math.sin(2.0 * math.pi * t / period_s)
            payload = f"T1:{value:.3f}\n"
            ser.write(payload.encode("utf-8"))
            time.sleep(interval)


if __name__ == "__main__":
    main()
