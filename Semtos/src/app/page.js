"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useTrafficStream } from '../../hooks/useTrafficStream';
import { useTrafficSignal } from '../../hooks/useTrafficSignal';
import { Canvas3D } from '../../components/Canvas3D';

function SignalHUD({ phase, nGreen, sGreen, eGreen, wGreen, nYellow, sYellow, eYellow, wYellow, timeRemaining }) {
  const phaseLabel = {
    ALL_RED:      { text: 'ALL APPROACHES - GRIDLOCK',      color: '#ef4444', sub: 'Press ENTER to dispatch ambulance' },
    W_GREEN:      { text: 'EMERGENCY - WEST CORRIDOR OPEN', color: '#f97316', sub: 'Ambulance en route - N/S/E holding' },
    N_RELEASE:    { text: 'NORTH RELEASED',                 color: '#22c55e', sub: 'S/E/W holding' },
    S_RELEASE:    { text: 'SOUTH RELEASED',                 color: '#22c55e', sub: 'E/W holding' },
    E_RELEASE:    { text: 'EAST RELEASED',                  color: '#22c55e', sub: 'Resuming normal cycle' },
    NORMAL_CYCLE: { text: 'NORMAL CYCLE',                   color: '#60a5fa', sub: 'Standard signal rotation active' },
  };
  const p = phaseLabel[phase] || { text: phase, color: '#fff', sub: '' };
  const arms = [
    { label: 'NORTH', green: nGreen, yellow: nYellow },
    { label: 'EAST',  green: eGreen, yellow: eYellow },
    { label: 'SOUTH', green: sGreen, yellow: sYellow },
    { label: 'WEST',  green: wGreen, yellow: wYellow },
  ];
  return (
    <div style={{ position:'fixed',top:20,left:20,zIndex:100,background:'rgba(2,6,23,0.88)',border:`1.5px solid ${p.color}`,borderRadius:10,padding:'12px 18px',fontFamily:'monospace',minWidth:240,boxShadow:`0 0 18px ${p.color}55` }}>
      <div style={{ fontSize:11,color:'#94a3b8',letterSpacing:2,marginBottom:4 }}>TRAFFIC SIGNAL - CASE 01</div>
      <div style={{ fontSize:14,fontWeight:700,color:p.color,marginBottom:2 }}>{p.text}</div>
      <div style={{ fontSize:11,color:'#64748b',marginBottom:8 }}>{p.sub}</div>
      {(phase==='N_RELEASE'||phase==='S_RELEASE'||phase==='E_RELEASE')&&(
        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
          <span style={{ fontSize:11,color:'#64748b' }}>NEXT IN</span>
          <span style={{ fontSize:22,fontWeight:900,color:p.color }}>{timeRemaining}s</span>
        </div>
      )}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,fontSize:11 }}>
        {arms.map(({label,green,yellow})=>{
          const icon=green?'🟢':yellow?'🟡':'🔴';
          const col=green?'#22c55e':yellow?'#facc15':'#ef4444';
          return(<div key={label} style={{color:col,display:'flex',gap:4,alignItems:'center'}}><span>{icon}</span><span style={{color:'#94a3b8'}}>{label}</span></div>);
        })}
      </div>
    </div>
  );
}

import { useGeospatialSimulation, CORRIDORS } from '../../hooks/useGeospatialSimulation';
import { MapboxSimulation } from '../../components/MapboxSimulation';

export default function Dashboard() {
  const [started, setStarted] = useState(false);
  const [viewMode, setViewMode] = useState('MAP'); // 'MAP' | 'TWIN' | 'SPLIT'
  const [selectedCorridorKey, setSelectedCorridorKey] = useState('SF_MARKET');

  const vehiclesRef = useRef([]);
  const { ambulancePosition, isSimulationRunning, isFrozen, registerCallbacks, registerVehiclesRef } = useTrafficStream(true);
  const { phase, nGreen,sGreen,eGreen,wGreen, nYellow,sYellow,eYellow,wYellow, isPreempted, onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle, signalPhase, timeRemaining } = useTrafficSignal();

  // Geospatial Map Simulation hook
  const {
    corridor,
    simState: geoSimState,
    civilianVehicles: geoCivilianVehicles,
    dispatchAmbulance: dispatchGeoAmbulance,
    toggleFreeze: toggleGeoFreeze,
    toggleRealPhoneGps: toggleGeoPhoneGps,
  } = useGeospatialSimulation(selectedCorridorKey);

  useEffect(() => {
    registerCallbacks(onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle);
    if (registerVehiclesRef) {
      registerVehiclesRef(vehiclesRef);
    }
  }, [registerCallbacks, registerVehiclesRef, onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle]);

  const cases = [
    {
      id: 1,
      label: 'CASE 01',
      title: 'Ambulance Priority Preemption (3D Map & Twin)',
      description: 'Real-world 3D geospatial simulation powered by Mapbox GL engine with live V2X preemption, BLE radar wave detection, and civilian pull-over corridor clearance.',
      tags: ['Mapbox 3D Engine', 'Live V2X Telemetry', 'BLE Preemption', '3D Buildings', 'Driver Companion'],
      color: '#22c55e',
      available: true,
    },
    { id: 2, label: 'CASE 02', title: 'Adaptive Signal Timing', description: 'AI-powered signal timing that dynamically adjusts green phase durations based on real-time vehicle queue density detected on each arm of the intersection.', tags: ['Queue Detection', 'AI Optimization', 'Dynamic Timing'], color: '#60a5fa', available: false },
    { id: 3, label: 'CASE 03', title: 'Multi-Intersection Coordination', description: 'City-wide green wave coordination across a grid of intersections. Vehicles moving at the speed limit experience a continuous sequence of green lights along a corridor.', tags: ['Green Wave', 'Multi-Junction', 'V2I Communication'], color: '#a78bfa', available: false },
  ];

  if (!started) {
    return (
      <div style={{ minHeight:'100vh',background:'radial-gradient(ellipse at 50% 0%,#0f2027 0%,#020617 60%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px',fontFamily:"'Courier New',monospace" }}>
        <div style={{ textAlign:'center',marginBottom:48 }}>
          <div style={{ fontSize:11,letterSpacing:6,color:'#64748b',marginBottom:8 }}>DIGITAL TWIN COMMAND DASHBOARD</div>
          <h1 style={{ fontSize:'clamp(2rem,5vw,3.5rem)',fontWeight:900,color:'#22c55e',letterSpacing:'0.25em',margin:0,textShadow:'0 0 40px rgba(34,197,94,0.4)' }}>SEMTOS CMD</h1>
          <p style={{ color:'#475569',fontSize:13,marginTop:10,maxWidth:480,lineHeight:1.7 }}>Select a simulation case to initialize the 3D digital twin environment.</p>
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:24,width:'100%',maxWidth:1000 }}>
          {cases.map((c)=>(
            <div key={c.id} onClick={()=>c.available&&setStarted(true)}
              style={{ background:c.available?`linear-gradient(135deg,rgba(2,6,23,0.95) 0%,rgba(${c.id===1?'34,197,94':c.id===2?'96,165,250':'167,139,250'},0.08) 100%)`:'rgba(2,6,23,0.6)',border:`1.5px solid ${c.available?c.color:'#1e293b'}`,borderRadius:16,padding:'28px 24px',cursor:c.available?'pointer':'not-allowed',position:'relative',transition:'transform 0.2s,box-shadow 0.2s',boxShadow:c.available?`0 0 32px ${c.color}22,0 4px 24px rgba(0,0,0,0.5)`:'0 4px 24px rgba(0,0,0,0.4)',opacity:c.available?1:0.55,overflow:'hidden' }}
              onMouseEnter={e=>{if(c.available){e.currentTarget.style.transform='translateY(-4px)';e.currentTarget.style.boxShadow=`0 0 48px ${c.color}44,0 8px 32px rgba(0,0,0,0.6)`;}}}
              onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow=c.available?`0 0 32px ${c.color}22,0 4px 24px rgba(0,0,0,0.5)`:'0 4px 24px rgba(0,0,0,0.4)';}}
            >
              {!c.available&&<div style={{ position:'absolute',top:16,right:16,background:'#1e293b',color:'#64748b',fontSize:9,letterSpacing:2,padding:'3px 10px',borderRadius:20,border:'1px solid #334155' }}>COMING SOON</div>}
              {c.available&&<div style={{ position:'absolute',top:16,right:16,display:'flex',alignItems:'center',gap:5 }}><div style={{ width:7,height:7,borderRadius:'50%',background:c.color,boxShadow:`0 0 8px ${c.color}`,animation:'pulse 2s infinite' }}/><span style={{ fontSize:9,letterSpacing:2,color:c.color }}>READY</span></div>}
              <div style={{ fontSize:10,letterSpacing:4,color:c.color,marginBottom:12,opacity:0.8 }}>{c.label}</div>
              <h2 style={{ fontSize:18,fontWeight:700,color:c.available?'#f1f5f9':'#475569',margin:'0 0 12px 0',lineHeight:1.3 }}>{c.title}</h2>
              <p style={{ fontSize:12,color:c.available?'#94a3b8':'#334155',lineHeight:1.7,margin:'0 0 20px 0' }}>{c.description}</p>
              <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:24 }}>
                {c.tags.map(tag=>(<span key={tag} style={{ fontSize:9,letterSpacing:1,padding:'3px 8px',borderRadius:4,background:c.available?`${c.color}15`:'rgba(30,41,59,0.5)',color:c.available?c.color:'#334155',border:`1px solid ${c.available?`${c.color}30`:'#1e293b'}` }}>{tag}</span>))}
              </div>
              <div style={{ padding:'10px 0',borderTop:`1px solid ${c.available?`${c.color}30`:'#1e293b'}`,fontSize:11,letterSpacing:3,color:c.available?c.color:'#334155',fontWeight:700 }}>
                {c.available?'▶ LAUNCH SIMULATION':'⊘ NOT AVAILABLE'}
              </div>
            </div>
          ))}
        </div>
        <p style={{ color:'#1e293b',fontSize:11,marginTop:36,letterSpacing:2 }}>SEMTOS - SMART EMERGENCY MANAGEMENT TRAFFIC OPTIMIZATION SYSTEM</p>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-200 font-mono flex flex-col">
      {/* ── Top Header Navigation Bar ── */}
      <header className="h-14 w-full flex-none z-30 flex items-center justify-between px-5 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 pointer-events-auto">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setStarted(false)}
            className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-900 border border-slate-700 transition"
          >
            ← CASES
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#22c55e]" />
            <span className="font-bold text-white text-sm tracking-wider">SEMTOS CMD</span>
            <span className="text-[10px] text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/30">
              V2X DIGITAL TWIN
            </span>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setViewMode('MAP')}
            className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
              viewMode === 'MAP'
                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🗺️</span> 3D MAP
          </button>
          <button
            onClick={() => setViewMode('TWIN')}
            className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
              viewMode === 'TWIN'
                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🏙️</span> 3D TWIN
          </button>
          <button
            onClick={() => setViewMode('SPLIT')}
            className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
              viewMode === 'SPLIT'
                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>⚡</span> SPLIT VIEW
          </button>
        </div>

        {/* Corridor Selection & Driver App Link */}
        <div className="flex items-center gap-3">
          {viewMode !== 'TWIN' && (
            <select
              value={selectedCorridorKey}
              onChange={(e) => setSelectedCorridorKey(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
            >
              {Object.keys(CORRIDORS).map((key) => (
                <option key={key} value={key}>
                  {CORRIDORS[key].name}
                </option>
              ))}
            </select>
          )}

          <a
            href="/driver"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition"
          >
            <span>📱</span>
            <span>DRIVER COMPANION</span>
            <span className="text-[10px] opacity-75">↗</span>
          </a>
        </div>
      </header>

      {/* ── Main Viewports Container ── */}
      <div className="flex-1 w-full relative flex overflow-hidden">
        {/* 1. 3D Geospatial Map View */}
        {(viewMode === 'MAP' || viewMode === 'SPLIT') && (
          <div className={`${viewMode === 'SPLIT' ? 'w-1/2 border-r border-slate-800' : 'w-full'} h-full relative`}>
            <MapboxSimulation
              corridor={corridor}
              simState={geoSimState}
              civilianVehicles={geoCivilianVehicles}
              onDispatch={dispatchGeoAmbulance}
              onToggleFreeze={toggleGeoFreeze}
              onTogglePhoneGps={toggleGeoPhoneGps}
            />
          </div>
        )}

        {/* 2. 3D Three.js Intersection Twin View */}
        {(viewMode === 'TWIN' || viewMode === 'SPLIT') && (
          <div className={`${viewMode === 'SPLIT' ? 'w-1/2' : 'w-full'} h-full relative`}>
            <div className="absolute inset-0 z-0">
              <Canvas3D
                vehiclesRef={vehiclesRef}
                ambulancePosition={ambulancePosition}
                isSimulationRunning={isSimulationRunning}
                isPreempted={isPreempted}
                isFrozen={isFrozen}
                signalPhase={signalPhase}
                nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
                nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
              />
            </div>
            {viewMode === 'TWIN' && (
              <SignalHUD
                phase={phase}
                nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
                nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
                timeRemaining={timeRemaining}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

