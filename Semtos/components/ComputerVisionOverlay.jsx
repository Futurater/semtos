import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export function ComputerVisionOverlay({ vehiclesRef, ambulancePosition, isSimulationRunning = false, isPreempted, isActive = true }) {
  const canvasRef = useRef(null);

  useFrame(({ camera }) => {
    if (!isActive || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const vehicles = vehiclesRef?.current || [];
    let detectedCount = 0;
    let queueCount = 0;

    // 1. Draw Virtual Ground Sensor Line AD23 across the West approach road
    const p1 = new THREE.Vector3(-14.0, 0.05, -9.5);
    const p2 = new THREE.Vector3(-14.0, 0.05, -1.5);
    p1.project(camera);
    p2.project(camera);

    if (p1.z < 1 && p2.z < 1) {
      const sx1 = (p1.x * 0.5 + 0.5) * width;
      const sy1 = (-p1.y * 0.5 + 0.5) * height;
      const sx2 = (p2.x * 0.5 + 0.5) * width;
      const sy2 = (-p2.y * 0.5 + 0.5) * height;

      // Green dashed sensor detection line
      ctx.beginPath();
      ctx.setLineDash([8, 4]);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Sensor line badge
      const midX = (sx1 + sx2) / 2;
      const midY = (sy1 + sy2) / 2;
      const badgeText = `AD23=${queueCount || 4}`;
      ctx.font = 'bold 11px monospace';
      const textW = ctx.measureText(badgeText).width;

      ctx.fillStyle = '#15803d';
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(midX - textW / 2 - 6, midY - 10, textW + 12, 20, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeText, midX - textW / 2, midY + 4);
    }

    // 2. Draw Traffic Vehicles Bounding Boxes & Tags
    vehicles.forEach((veh) => {
      const vehPos = new THREE.Vector3(veh.pos.x, (veh.pos.y || 0.2) + 0.6, veh.pos.z);
      const dist = camera.position.distanceTo(vehPos);

      // Track all visible vehicles within camera view range
      if (dist < 2.0 || dist > 110) return;

      const proj = vehPos.clone().project(camera);
      if (proj.z >= 1) return; // Behind camera

      const sx = (proj.x * 0.5 + 0.5) * width;
      const sy = (-proj.y * 0.5 + 0.5) * height;

      if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) return;

      detectedCount++;
      if (veh.type === 'E' && veh.pos.x < 0 && veh.pos.x > -40) {
        queueCount++;
      }

      // Determine class, label, and color matching reference image
      let label = `car ${veh.id * 7 % 89 + 10}`;
      let color = '#dc2626'; // Red for standard cars
      let category = 'car';

      if (veh.modelIdx === 1) {
        label = `truck ${veh.id * 11 % 80 + 20}`;
        color = '#16a34a'; // Green for trucks
        category = 'truck';
      } else if (veh.modelIdx === 2) {
        label = `bus ${veh.id * 13 % 70 + 30}`;
        color = '#2563eb'; // Blue for buses
        category = 'bus';
      } else {
        const confScores = [73, 92, 59, 12, 6, 7, 88, 95, 97, 15, 5];
        label = `car ${confScores[veh.id % confScores.length]}`;
      }

      // Scale bounding box with distance
      const boxW = Math.max(34, Math.min(220, (width * 1.5) / dist));
      const boxH = boxW * (category === 'bus' ? 0.95 : category === 'truck' ? 0.8 : 0.68);
      const left = sx - boxW / 2;
      const top = sy - boxH / 2;

      // Tracking anchor point on asphalt
      const basePos = new THREE.Vector3(veh.pos.x, 0.05, veh.pos.z).project(camera);
      if (basePos.z < 1) {
        const baseSx = (basePos.x * 0.5 + 0.5) * width;
        const baseSy = (-basePos.y * 0.5 + 0.5) * height;

        ctx.beginPath();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.moveTo(sx, top + boxH);
        ctx.lineTo(baseSx, baseSy);
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(baseSx, baseSy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw YOLO Bounding Box Rectangle
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, boxW, boxH);

      // Corner Reticle Accents (white tick marks)
      const tick = Math.min(8, boxW * 0.2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      // Top-Left
      ctx.beginPath(); ctx.moveTo(left, top + tick); ctx.lineTo(left, top); ctx.lineTo(left + tick, top); ctx.stroke();
      // Top-Right
      ctx.beginPath(); ctx.moveTo(left + boxW - tick, top); ctx.lineTo(left + boxW, top); ctx.lineTo(left + boxW, top + tick); ctx.stroke();
      // Bottom-Left
      ctx.beginPath(); ctx.moveTo(left, top + boxH - tick); ctx.lineTo(left, top + boxH); ctx.lineTo(left + tick, top + boxH); ctx.stroke();
      // Bottom-Right
      ctx.beginPath(); ctx.moveTo(left + boxW - tick, top + boxH); ctx.lineTo(left + boxW, top + boxH); ctx.lineTo(left + boxW, top + boxH - tick); ctx.stroke();

      // Top Label Tag
      ctx.font = 'bold 11px monospace';
      const labelW = ctx.measureText(label).width + 10;
      ctx.fillStyle = color;
      ctx.fillRect(left, top - 18, labelW, 18);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, left + 5, top - 5);
    });

    // 3. Draw Ambulance Bounding Box & Priority Badge
    if (isSimulationRunning && ambulancePosition) {
      const ambPos = new THREE.Vector3(ambulancePosition.x, (ambulancePosition.y || 0.5) + 0.6, ambulancePosition.z);
      const dist = camera.position.distanceTo(ambPos);

      // Track ambulance while in camera view
      if (dist >= 2.0 && dist <= 120) {
        const proj = ambPos.clone().project(camera);
        if (proj.z < 1) {
          const sx = (proj.x * 0.5 + 0.5) * width;
          const sy = (-proj.y * 0.5 + 0.5) * height;

          if (sx >= -40 && sx <= width + 40 && sy >= -40 && sy <= height + 40) {
            detectedCount++;
            const ambColor = '#06b6d4'; // Cyan for emergency priority
            const boxW = Math.max(38, Math.min(260, (width * 1.6) / dist));
            const boxH = boxW * 0.75;
            const left = sx - boxW / 2;
            const top = sy - boxH / 2;

            // Tracking vector to asphalt
            const basePos = new THREE.Vector3(ambulancePosition.x, 0.05, ambulancePosition.z).project(camera);
            if (basePos.z < 1) {
              const baseSx = (basePos.x * 0.5 + 0.5) * width;
              const baseSy = (-basePos.y * 0.5 + 0.5) * height;

              ctx.beginPath();
              ctx.strokeStyle = '#06b6d4';
              ctx.lineWidth = 1.8;
              ctx.moveTo(sx, top + boxH);
              ctx.lineTo(baseSx, baseSy);
              ctx.stroke();

              ctx.fillStyle = '#06b6d4';
              ctx.beginPath();
              ctx.arc(baseSx, baseSy, 3.5, 0, Math.PI * 2);
              ctx.fill();
            }

            // Bounding box with glow
            ctx.shadowColor = 'rgba(6, 182, 212, 0.8)';
            ctx.shadowBlur = 12;
            ctx.strokeStyle = ambColor;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(left, top, boxW, boxH);
            ctx.shadowBlur = 0;

            // Corner Accents
            const tick = Math.min(10, boxW * 0.2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(left, top + tick); ctx.lineTo(left, top); ctx.lineTo(left + tick, top); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(left + boxW - tick, top); ctx.lineTo(left + boxW, top); ctx.lineTo(left + boxW, top + tick); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(left, top + boxH - tick); ctx.lineTo(left, top + boxH); ctx.lineTo(left + tick, top + boxH); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(left + boxW - tick, top + boxH); ctx.lineTo(left + boxW, top + boxH); ctx.lineTo(left + boxW, top + boxH - tick); ctx.stroke();

            // Label tag
            const ambLabel = 'ambulance 99% [PRIORITY]';
            ctx.font = 'bold 11px monospace';
            const labelW = ctx.measureText(ambLabel).width + 12;
            ctx.fillStyle = ambColor;
            ctx.fillRect(left, top - 20, labelW, 20);

            ctx.fillStyle = '#020617';
            ctx.fillText(ambLabel, left + 6, top - 6);
          }
        }
      }
    }

    // 4. Draw CCTV Top-Center AI Detection HUD
    const hudW = 440;
    const hudH = 34;
    const hudX = width / 2 - hudW / 2;
    const hudY = 20;

    ctx.fillStyle = 'rgba(2, 6, 23, 0.90)';
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(hudX, hudY, hudW, hudH, 6);
    ctx.fill();
    ctx.stroke();

    // Red recording pulse dot
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(hudX + 18, hudY + hudH / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#f87171';
    ctx.fillText('AI DETECTION ACTIVE', hudX + 28, hudY + 21);

    ctx.fillStyle = '#64748b';
    ctx.fillText('|', hudX + 175, hudY + 21);

    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`YOLOv8 (${detectedCount} TARGETS)`, hudX + 190, hudY + 21);

    ctx.fillStyle = '#64748b';
    ctx.fillText('|', hudX + 325, hudY + 21);

    ctx.fillStyle = isPreempted ? '#38bdf8' : '#22c55e';
    ctx.fillText(isPreempted ? '🚨 PREEMPTION' : 'MONITORING', hudX + 340, hudY + 21);

    // Viewport Corner Reticles
    const cSize = 24;
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.7)';
    ctx.lineWidth = 2;
    // Top-Left
    ctx.beginPath(); ctx.moveTo(16, 16 + cSize); ctx.lineTo(16, 16); ctx.lineTo(16 + cSize, 16); ctx.stroke();
    // Top-Right
    ctx.beginPath(); ctx.moveTo(width - 16 - cSize, 16); ctx.lineTo(width - 16, 16); ctx.lineTo(width - 16, 16 + cSize); ctx.stroke();
    // Bottom-Left
    ctx.beginPath(); ctx.moveTo(16, height - 16 - cSize); ctx.lineTo(16, height - 16); ctx.lineTo(16 + cSize, height - 16); ctx.stroke();
    // Bottom-Right
    ctx.beginPath(); ctx.moveTo(width - 16 - cSize, height - 16); ctx.lineTo(width - 16, height - 16); ctx.lineTo(width - 16, height - 16 - cSize); ctx.stroke();

    ctx.restore();
  });

  if (!isActive) return null;

  return (
    <Html
      calculatePosition={() => [0, 0]}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 40,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </Html>
  );
}
