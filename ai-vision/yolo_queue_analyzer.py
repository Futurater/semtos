#!/usr/bin/env python3
"""
SEMTOS — Smart Emergency Management and Traffic Orchestration System
============================================================================
File: ai-vision/yolo_queue_analyzer.py (Milestone 5 — Edge-AI YOLOv8 + OpenCV
      Intersection Queue & Gridlock Analyzer)

Capabilities Implemented:
  1. Real-Time Vehicle Detection (Ultralytics YOLOv8 + OpenCV):
     - Processes a pre-recorded traffic video (`--source traffic.mp4`), live
       laptop webcam (`--source 0`), or synthetic intersection feed (`--simulate`).
     - Detects COCO vehicle classes: car (2), motorcycle (3), bus (5), truck (7).
  2. Polygonal Target-Lane Region of Interest (ROI) Filtering:
     - Checks whether each detected vehicle's bottom-center anchor point lies
       inside the approaching lane's stop-line ROI polygon.
  3. Dynamic Green-Hold Duration & Deadlock Rerouting Math:
     - Computes:
         T_hold = min(T_max, T_base + ceil(N_queue * t_discharge) + T_buffer)
     - Flags junction deadlock (`deadlockDetected = True`) when `N_queue >= 12`,
       triggering automatic bypass rerouting on `v2x-server.js`.
  4. Zero-Dependency V2X Server Synchronization:
     - Streams live queue analytics to `http://localhost:4081/api/yolo-queue`
       using Python's built-in `urllib.request` (no extra HTTP/WS pip packages
       required).
  5. Interactive Viva / Lab Demo Hotkeys (Inside OpenCV Window):
     - Press `+` / `=` : Add +1 simulated queued vehicle bias
     - Press `-`       : Subtract -1 queued vehicle bias
     - Press `g`       : Force Gridlock surge (14 queued vehicles -> Deadlock Reroute)
     - Press `c`       : Clear queue back to normal (3 queued vehicles)
     - Press `q` / ESC : Exit cleanly

Usage Examples:
  # 1. Run with laptop webcam (or auto-fallback to synthetic visual feed):
  python ai-vision/yolo_queue_analyzer.py --source 0

  # 2. Run on a pre-recorded intersection CCTV video file:
  python ai-vision/yolo_queue_analyzer.py --source sample_traffic.mp4

  # 3. Run synthetic visual traffic simulator (great for indoor demos without video):
  python ai-vision/yolo_queue_analyzer.py --simulate
"""

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

# Optional OpenCV & NumPy imports (graceful fallback if unavailable)
try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    cv2 = None
    np = None
    HAS_OPENCV = False

# Optional Ultralytics YOLOv8 import (graceful fallback if unavailable)
try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    YOLO = None
    HAS_YOLO = False


# ── 1. SEMTOS Queue & Hold Model Constants ───────────────────────────────────
COCO_VEHICLE_CLASSES: Dict[int, str] = {
    2: "CAR",
    3: "MOTORCYCLE",
    5: "BUS",
    7: "TRUCK",
}

T_BASE_SECONDS = 10
T_DISCHARGE_PER_CAR = 2.2
T_BUFFER_SECONDS = 4
T_MAX_HOLD_SECONDS = 60
DEADLOCK_QUEUE_THRESHOLD = 12


def calculate_green_hold_seconds(queue_count: int) -> int:
    """
    Computes queue-aware green phase hold duration:
      T_hold = min(T_max, T_base + ceil(N_queue * t_discharge) + T_buffer)
    """
    n = max(0, int(queue_count))
    raw_hold = T_BASE_SECONDS + math.ceil(n * T_DISCHARGE_PER_CAR) + T_BUFFER_SECONDS
    return min(T_MAX_HOLD_SECONDS, raw_hold)


def classify_queue_density(queue_count: int) -> str:
    if queue_count >= DEADLOCK_QUEUE_THRESHOLD:
        return "GRIDLOCK"
    if queue_count >= 8:
        return "HIGH"
    if queue_count >= 4:
        return "MODERATE"
    return "LOW"


# ── 2. Polygonal Target-Lane ROI Helper ──────────────────────────────────────
def get_target_lane_roi_polygon(frame_width: int, frame_height: int) -> List[Tuple[int, int]]:
    """
    Returns a trapezoid polygon covering the approaching emergency corridor lane
    leading up to the intersection stop bar.
    """
    return [
        (int(frame_width * 0.28), int(frame_height * 0.22)),  # Top-Left (far approach)
        (int(frame_width * 0.72), int(frame_height * 0.22)),  # Top-Right (far approach)
        (int(frame_width * 0.90), int(frame_height * 0.92)),  # Bottom-Right (stop line)
        (int(frame_width * 0.10), int(frame_height * 0.92)),  # Bottom-Left (stop line)
    ]


def is_point_inside_polygon(point: Tuple[int, int], polygon: List[Tuple[int, int]]) -> bool:
    """
    Ray-casting point-in-polygon check (works with or without OpenCV).
    """
    x, y = point
    inside = False
    n = len(polygon)
    px1, py1 = polygon[0]
    for i in range(1, n + 1):
        px2, py2 = polygon[i % n]
        if y > min(py1, py2):
            if y <= max(py1, py2):
                if x <= max(px1, px2):
                    if py1 != py2:
                        xinters = (y - py1) * (px2 - px1) / float(py2 - py1) + px1
                    if px1 == px2 or x <= xinters:
                        inside = not inside
        px1, py1 = px2, py2
    return inside


# ── 3. V2X Orchestrator Telemetry Publisher (`POST /api/yolo-queue`) ─────────
def post_queue_update_to_v2x(
    server_url: str,
    queue_count: int,
    detected_vehicles: int,
    source_label: str = "YOLOV8_OPENCV_EDGE",
) -> Tuple[bool, str]:
    endpoint = f"{server_url.rstrip('/')}/api/yolo-queue"
    hold_sec = calculate_green_hold_seconds(queue_count)
    density = classify_queue_density(queue_count)
    deadlock = queue_count >= DEADLOCK_QUEUE_THRESHOLD

    payload = {
        "queueCount": queue_count,
        "detectedVehicles": max(queue_count, detected_vehicles),
        "queueDensity": density,
        "recommendedHoldSeconds": hold_sec,
        "deadlockDetected": deadlock,
        "source": source_label,
        "timestamp": int(time.time() * 1000),
    }

    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data_bytes,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=1.2) as resp:
            if 200 <= resp.status < 300:
                return True, f"SYNCED ({resp.status})"
            return False, f"HTTP {resp.status}"
    except urllib.error.URLError as err:
        return False, f"OFFLINE ({err.reason})"
    except Exception as exc:
        return False, f"ERR ({exc})"


# ── 4. Synthetic Intersection Frame Generator (For Lab Demo Without Video) ───
def render_synthetic_traffic_frame(
    width: int,
    height: int,
    tick: int,
    target_car_count: int,
) -> Tuple["np.ndarray", List[Tuple[int, int, int, int, str, float]]]:
    """
    Generates a clean dark-mode CCTV intersection frame with `target_car_count`
    vehicles queued inside the approaching lane ROI plus 2 cross-lane vehicles.
    Returns (frame, detections) where each detection is (x1, y1, x2, y2, label, conf).
    """
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = (28, 20, 12)  # Dark slate background

    # Draw approaching road surface trapezoid
    road_pts = np.array(
        [
            [int(width * 0.25), int(height * 0.15)],
            [int(width * 0.75), int(height * 0.15)],
            [int(width * 0.95), int(height * 0.96)],
            [int(width * 0.05), int(height * 0.96)],
        ],
        dtype=np.int32,
    )
    cv2.fillPoly(frame, [road_pts], (45, 42, 38))

    # Draw lane dividers
    for lane_frac in (0.38, 0.50, 0.62):
        x_top = int(width * (0.25 + (lane_frac - 0.25) * 0.8))
        x_bot = int(width * lane_frac)
        cv2.line(frame, (x_top, int(height * 0.18)), (x_bot, int(height * 0.94)), (95, 95, 95), 2)

    # Stop line at bottom
    cv2.line(
        frame,
        (int(width * 0.10), int(height * 0.90)),
        (int(width * 0.90), int(height * 0.90)),
        (220, 220, 220),
        3,
    )

    detections: List[Tuple[int, int, int, int, str, float]] = []

    # Generate queued vehicles across 3 approaching lanes inside the ROI
    lanes_x = [0.28, 0.50, 0.70]
    for idx in range(target_car_count):
        col = idx % 3
        row = idx // 3
        base_y = int(height * (0.80 - row * 0.115))
        if base_y < int(height * 0.23):
            base_y = int(height * 0.23) + (idx * 7) % 40

        jitter_y = int(3 * math.sin((tick * 0.15) + idx))
        cy = base_y + jitter_y
        cx = int(width * lanes_x[col])

        box_w = int(width * (0.085 - row * 0.006))
        box_h = int(height * (0.075 - row * 0.005))
        x1, y1 = cx - box_w // 2, cy - box_h // 2
        x2, y2 = cx + box_w // 2, cy + box_h // 2

        # Draw synthetic vehicle chassis
        cv2.rectangle(frame, (x1, y1), (x2, y2), (180, 140, 70), -1)
        cv2.rectangle(frame, (x1 + 4, y1 + 4), (x2 - 4, y2 - 4), (40, 35, 30), -1)
        label = "BUS" if idx == 4 else ("TRUCK" if idx == 9 else "CAR")
        conf = round(0.86 + ((idx * 3) % 12) * 0.01, 2)
        detections.append((x1, y1, x2, y2, label, conf))

    # Add 1 out-of-ROI background vehicle for realism
    bg_x = int(width * 0.06)
    bg_y = int(height * (0.35 + 0.25 * math.sin(tick * 0.05)))
    detections.append((bg_x, bg_y, bg_x + 46, bg_y + 34, "CAR", 0.79))

    return frame, detections


# ── 5. OpenCV HUD Overlay Renderer ───────────────────────────────────────────
def draw_semtos_hud_overlay(
    frame: "np.ndarray",
    roi_polygon: List[Tuple[int, int]],
    detections: List[Tuple[int, int, int, int, str, float]],
    queue_count: int,
    sync_status: str,
    fps: float,
    bias_offset: int,
) -> "np.ndarray":
    h, w = frame.shape[:2]
    hold_sec = calculate_green_hold_seconds(queue_count)
    density = classify_queue_density(queue_count)
    deadlock = queue_count >= DEADLOCK_QUEUE_THRESHOLD

    # Choose ROI color based on density (BGR format)
    if deadlock:
        roi_color = (48, 48, 239)   # Crimson Red
    elif queue_count >= 8:
        roi_color = (11, 158, 245)  # Amber
    else:
        roi_color = (94, 197, 34)   # Emerald Green

    # 1. Draw translucent ROI polygon overlay
    overlay = frame.copy()
    pts = np.array(roi_polygon, dtype=np.int32)
    cv2.fillPoly(overlay, [pts], roi_color)
    cv2.addWeighted(overlay, 0.14, frame, 0.86, 0, frame)
    cv2.polylines(frame, [pts], isClosed=True, color=roi_color, thickness=2)

    # 2. Draw vehicle bounding boxes + anchor points
    for (x1, y1, x2, y2, label, conf) in detections:
        anchor = ((x1 + x2) // 2, y2)
        in_roi = is_point_inside_polygon(anchor, roi_polygon)
        box_color = (94, 197, 34) if in_roi else (148, 163, 184)
        if deadlock and in_roi:
            box_color = (60, 60, 255)

        cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
        cv2.circle(frame, anchor, 4, (0, 255, 255) if in_roi else (120, 120, 120), -1)
        tag = f"{label} {int(conf * 100)}%" + (" [QUEUED]" if in_roi else "")
        cv2.putText(
            frame,
            tag,
            (x1, max(18, y1 - 6)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.44,
            box_color,
            1,
            cv2.LINE_AA,
        )

    # 3. Top Command HUD Banner
    cv2.rectangle(frame, (0, 0), (w, 82), (18, 10, 4), -1)
    cv2.line(frame, (0, 82), (w, 82), roi_color, 2)

    cv2.putText(
        frame,
        "SEMTOS EDGE-AI YOLOv8 INTERSECTION QUEUE ANALYZER",
        (16, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.58,
        (94, 197, 34),
        2,
        cv2.LINE_AA,
    )

    metrics_line = (
        f"QUEUED IN ROI: {queue_count} veh  |  "
        f"DENSITY: {density}  |  "
        f"DYNAMIC GREEN HOLD: {hold_sec}s  |  "
        f"FPS: {fps:.1f}"
    )
    cv2.putText(
        frame,
        metrics_line,
        (16, 50),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.50,
        (240, 245, 250),
        1,
        cv2.LINE_AA,
    )

    status_line = (
        f"V2X SERVER: {sync_status}  |  "
        f"BIAS: {bias_offset:+d}  |  "
        f"KEYS: [+/-] Adjust Queue  [G] Gridlock(14)  [C] Clear(3)  [Q] Quit"
    )
    cv2.putText(
        frame,
        status_line,
        (16, 72),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.42,
        (160, 185, 210),
        1,
        cv2.LINE_AA,
    )

    # 4. Deadlock Alert Banner at Bottom if >= 12 vehicles
    if deadlock:
        cv2.rectangle(frame, (0, h - 44), (w, h), (30, 30, 210), -1)
        cv2.putText(
            frame,
            f"WARNING: JUNCTION GRIDLOCK ({queue_count} CARS >= 12) -> V2X DYNAMIC REROUTING ACTIVE",
            (18, h - 16),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.54,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    return frame


# ── 6. Main Execution Loop ───────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="SEMTOS Edge-AI YOLOv8 + OpenCV Intersection Queue Analyzer"
    )
    parser.add_argument(
        "--source",
        type=str,
        default="0",
        help="Video file path, RTSP URL, or webcam index (default: '0')",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="yolov8n.pt",
        help="Ultralytics YOLOv8 model weights (default: yolov8n.pt)",
    )
    parser.add_argument(
        "--server",
        type=str,
        default="http://localhost:4081",
        help="SEMTOS V2X server base URL (default: http://localhost:4081)",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.35,
        help="YOLOv8 minimum confidence threshold (default: 0.35)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Minimum interval (seconds) between V2X HTTP updates (default: 1.0)",
    )
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="Run in synthetic traffic camera mode (no webcam/video required)",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Disable OpenCV GUI window (for headless/SSH testing)",
    )
    parser.add_argument(
        "--frames",
        type=int,
        default=0,
        help="Optional max frame count before exiting (0 = run continuously)",
    )
    args = parser.parse_args()

    print("====================================================================")
    print("🎥 SEMTOS Edge-AI YOLOv8 + OpenCV Queue Analyzer Starting...")
    print(f"   Target V2X Orchestrator : {args.server}/api/yolo-queue")
    print(f"   OpenCV Available        : {HAS_OPENCV}")
    print(f"   Ultralytics YOLOv8      : {HAS_YOLO}")
    print("====================================================================")

    # Load YOLOv8 model if available and not forced into synthetic mode
    yolo_model = None
    use_synthetic_feed = args.simulate

    if not use_synthetic_feed and HAS_YOLO and HAS_OPENCV:
        try:
            print(f"[YOLO-EDGE] Loading YOLOv8 weights: {args.model} ...")
            yolo_model = YOLO(args.model)
        except Exception as exc:
            print(f"[YOLO-EDGE] ⚠️ Could not load YOLOv8 model ({exc}). Switching to Synthetic Vision Mode.")
            use_synthetic_feed = True
    else:
        use_synthetic_feed = True

    cap = None
    if not use_synthetic_feed and HAS_OPENCV:
        src = int(args.source) if args.source.isdigit() else args.source
        cap = cv2.VideoCapture(src)
        if not cap or not cap.isOpened():
            print(f"[YOLO-EDGE] ⚠️ Camera/Video source '{args.source}' unavailable. Switching to Synthetic Vision Mode.")
            use_synthetic_feed = True

    frame_w, frame_h = 960, 540
    roi_polygon = get_target_lane_roi_polygon(frame_w, frame_h)

    manual_bias = 0
    synthetic_base_cars = 5
    last_post_time = 0.0
    last_posted_queue: Optional[int] = None
    sync_status = "INIT"
    tick = 0
    fps = 24.0

    try:
        while True:
            t_start = time.time()
            tick += 1
            detections: List[Tuple[int, int, int, int, str, float]] = []

            if not use_synthetic_feed and cap is not None and HAS_OPENCV:
                ret, raw_frame = cap.read()
                if not ret:
                    # Loop video file seamlessly if it reached the end
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, raw_frame = cap.read()
                    if not ret:
                        use_synthetic_feed = True
                        continue

                frame = cv2.resize(raw_frame, (frame_w, frame_h))

                # Run YOLOv8 inference on vehicle classes [2, 3, 5, 7]
                results = yolo_model(
                    frame,
                    conf=args.conf,
                    classes=list(COCO_VEHICLE_CLASSES.keys()),
                    verbose=False,
                )
                for r in results:
                    if r.boxes is None:
                        continue
                    for box in r.boxes:
                        coords = box.xyxy[0].cpu().numpy().astype(int)
                        cls_id = int(box.cls[0].item())
                        conf_val = float(box.conf[0].item())
                        label = COCO_VEHICLE_CLASSES.get(cls_id, "VEHICLE")
                        detections.append(
                            (int(coords[0]), int(coords[1]), int(coords[2]), int(coords[3]), label, conf_val)
                        )

                roi_matched = sum(
                    1
                    for (x1, y1, x2, y2, _, _) in detections
                    if is_point_inside_polygon(((x1 + x2) // 2, y2), roi_polygon)
                )
                queue_count = max(0, roi_matched + manual_bias)

            elif HAS_OPENCV:
                # Synthetic visual intersection feed
                wave = int(round(2 * math.sin(tick * 0.03)))
                target_cars = max(0, min(16, synthetic_base_cars + wave + manual_bias))
                frame, detections = render_synthetic_traffic_frame(frame_w, frame_h, tick, target_cars)
                roi_matched = sum(
                    1
                    for (x1, y1, x2, y2, _, _) in detections
                    if is_point_inside_polygon(((x1 + x2) // 2, y2), roi_polygon)
                )
                queue_count = max(0, roi_matched)
            else:
                # Pure headless telemetry mode if OpenCV is not installed
                wave = int(round(2 * math.sin(tick * 0.15)))
                queue_count = max(0, min(16, synthetic_base_cars + wave + manual_bias))
                detections = []

            # Publish queue update to v2x-server.js on change or interval
            now = time.time()
            if (
                last_posted_queue != queue_count
                or (now - last_post_time) >= args.interval
            ):
                ok, sync_status = post_queue_update_to_v2x(
                    args.server,
                    queue_count=queue_count,
                    detected_vehicles=max(queue_count, len(detections)),
                    source_label="YOLOV8_SYNTHETIC" if use_synthetic_feed else "YOLOV8_LIVE_CAMERA",
                )
                last_post_time = now
                last_posted_queue = queue_count
                hold_s = calculate_green_hold_seconds(queue_count)
                density_s = classify_queue_density(queue_count)
                print(
                    f"[YOLO-EDGE] Queue={queue_count:2d} veh | Density={density_s:8s} | "
                    f"GreenHold={hold_s:2d}s | V2X={sync_status}"
                )

            if HAS_OPENCV and not args.headless:
                hud_frame = draw_semtos_hud_overlay(
                    frame,
                    roi_polygon=roi_polygon,
                    detections=detections,
                    queue_count=queue_count,
                    sync_status=sync_status,
                    fps=fps,
                    bias_offset=manual_bias,
                )
                cv2.imshow("SEMTOS - Edge-AI YOLOv8 Queue Analyzer", hud_frame)
                key = cv2.waitKey(30) & 0xFF
                if key in (ord("q"), 27):
                    break
                elif key in (ord("+"), ord("=")):
                    manual_bias = min(14, manual_bias + 1)
                elif key in (ord("-"), ord("_")):
                    manual_bias = max(-10, manual_bias - 1)
                elif key in (ord("g"), ord("G")):
                    manual_bias = 9  # Forces >= 12 cars (GRIDLOCK)
                elif key in (ord("c"), ord("C")):
                    manual_bias = -2  # Clears queue back to normal (~3 cars)
            else:
                time.sleep(0.25)

            elapsed = max(1e-3, time.time() - t_start)
            fps = 0.85 * fps + 0.15 * (1.0 / elapsed)

            if args.frames > 0 and tick >= args.frames:
                break

    except KeyboardInterrupt:
        print("\n[YOLO-EDGE] Stopping analyzer...")
    finally:
        if cap is not None:
            cap.release()
        if HAS_OPENCV and not args.headless:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass
    main()
