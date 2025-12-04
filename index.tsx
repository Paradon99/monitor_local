
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// --- Types & Data Models ---

type MonitorLevel = 'red' | 'orange' | 'yellow' | 'gray';
type MonitorCategory = 'host' | 'process' | 'network' | 'db' | 'trans' | 'link' | 'data' | 'client';

interface Scenario {
  id: string;
  category: MonitorCategory;
  metric: string;
  level: MonitorLevel;
  threshold: string;
}

interface MonitorTool {
  id: string;
  name: string;
  defaultCapabilities: MonitorCategory[];
  scenarios: Scenario[];
}

interface SystemData {
  id: string;
  name: string;
  tier: 'A' | 'B' | 'C';
  
  // 1.1.1 Configuration
  isSelfBuilt: boolean; // +5 bonus
  serverCoverage: 'full' | 'basic' | 'partial' | 'low'; // Server scope coverage
  
  // Tool Selection & Capabilities
  selectedToolIds: string[];
  toolCapabilities: Record<string, MonitorCategory[]>; 

  // 1.1.2 Standardization
  checkedScenarioIds: string[]; 

  // 1.1.3 Documentation
  documentedItems: number; // 0-5

  // 1.2 Detection (Granular)
  avgDetectionTime: number; // For record
  maxDetectionTime: number; // For record
  accuracyRate: 10 | 7 | 3 | 0; // 10=99%+, 7=95%+, 3=90%+, 0=<90%
  discoveryRate: 10 | 7 | 3 | 0; // 10=99%+, 7=95%+, 3=85%+, 0=<85%
  earlyDetectionCount: number; // Bonus

  // 1.3 Alerts
  opsLeadConfigured: boolean; // 5 or 0
  dataMonitorConfigured: 'full' | 'missing' | 'na'; 
  missingMonitorItems: number; 
  mismatchedAlertsCount: number; // Deduction

  // 1.4 Team
  lateResponseCount: number;
  overdueCount: number;
}

interface AppState {
  systems: SystemData[];
  tools: MonitorTool[];
  lastUpdated?: number;
}

// --- Constants ---

const CATEGORY_LABELS: Record<MonitorCategory, string> = {
  host: '主机性能', process: '进程状态', network: '网络负载', 
  db: '数据库', trans: '交易监控', link: '全链路', data: '数据核对', client: '客户端'
};

const MANDATORY_CAPS: MonitorCategory[] = ['host', 'process', 'network', 'db', 'trans'];

const DEFAULT_TOOLS: MonitorTool[] = [
  {
    id: 'zabbix', name: 'Zabbix', defaultCapabilities: ['host', 'process', 'network'],
    scenarios: [
      { id: 'z1', category: 'process', metric: '应用进程存活', level: 'orange', threshold: '0' },
      { id: 'z2', category: 'host', metric: 'CPU使用率', level: 'orange', threshold: '>90%' },
      { id: 'z4', category: 'network', metric: 'Ping不可达', level: 'orange', threshold: 'Down' },
    ]
  },
  {
    id: 'prometheus', name: 'Prometheus', defaultCapabilities: ['host', 'process', 'trans'],
    scenarios: [
      { id: 'p1', category: 'host', metric: 'JVM Heap使用率', level: 'yellow', threshold: '>90%' },
      { id: 'p3', category: 'trans', metric: '接口响应时间', level: 'yellow', threshold: '>2s' },
    ]
  }
];

const INITIAL_SYSTEM: SystemData = {
  id: 'sys_1', name: '示例系统', tier: 'A',
  isSelfBuilt: false,
  serverCoverage: 'full',
  selectedToolIds: ['zabbix'],
  toolCapabilities: { 'zabbix': ['host', 'process'] },
  checkedScenarioIds: ['z1'],
  documentedItems: 5,
  avgDetectionTime: 5,
  maxDetectionTime: 5,
  accuracyRate: 7,
  discoveryRate: 7,
  earlyDetectionCount: 0,
  opsLeadConfigured: true,
  dataMonitorConfigured: 'full',
  missingMonitorItems: 0,
  mismatchedAlertsCount: 0,
  lateResponseCount: 0,
  overdueCount: 0
};

// --- Storage API Adapter ---

const api = {
  load: async (): Promise<AppState | null> => {
    try {
      const res = await fetch('/api/monitor-data');
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      return data;
    } catch (e) {
      console.warn("API load failed, falling back to local defaults or storage", e);
      return null;
    }
  },
  save: async (data: AppState): Promise<boolean> => {
    try {
      const res = await fetch('/api/monitor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.ok;
    } catch (e) {
      console.error("API save failed", e);
      return false;
    }
  }
};

// --- Scoring Logic ---

const calculateScore = (data: SystemData, tools: MonitorTool[]) => {
  const details = {
    part1: 0, // 完整性 (60)
    part2: 0, // 故障检测 (20)
    part3: 0, // 告警 (10)
    part4: 0, // 团队 (10)
    total: 0,
    missingCaps: [] as MonitorCategory[],
    packageLevel: 'full' as string
  };

  // --- 1.1.1 Package Coverage ---
  const coveredCaps = new Set<MonitorCategory>();
  data.selectedToolIds.forEach(tid => {
    const caps = data.toolCapabilities[tid] || [];
    caps.forEach(c => coveredCaps.add(c));
  });

  const missingCaps = MANDATORY_CAPS.filter(c => !coveredCaps.has(c));
  details.missingCaps = missingCaps;

  const coveragePct = (MANDATORY_CAPS.length - missingCaps.length) / MANDATORY_CAPS.length;
  let pkgDeduction = 0;
  if (coveragePct === 1) { details.packageLevel = 'full'; pkgDeduction = 0; }
  else if (coveragePct >= 0.7) { details.packageLevel = 'basic'; pkgDeduction = 4; }
  else if (coveragePct >= 0.5) { details.packageLevel = 'partial'; pkgDeduction = 7; }
  else { details.packageLevel = 'low'; pkgDeduction = 10; }

  let score1_1 = 45 - pkgDeduction - (missingCaps.length * 15) - { 'full': 0, 'basic': 5, 'partial': 10, 'low': 15 }[data.serverCoverage];
  if (data.isSelfBuilt) score1_1 += 5;
  score1_1 = Math.max(0, score1_1);

  // --- 1.1.2 Standardization ---
  let score1_2 = 0;
  if (data.selectedToolIds.length > 0) {
    let sumTerms = 0;
    data.selectedToolIds.forEach(tid => {
      const tool = tools.find(t => t.id === tid);
      if (!tool) return;
      const enabledCaps = data.toolCapabilities[tid] || [];
      const relevantScenarios = tool.scenarios.filter(s => enabledCaps.includes(s.category));
      
      if (relevantScenarios.length === 0) {
        sumTerms += 10; 
      } else {
        const checkedCount = relevantScenarios.filter(s => data.checkedScenarioIds.includes(s.id)).length;
        const pct = (checkedCount / relevantScenarios.length) * 100;
        let Xi = 10;
        if (pct >= 99) Xi = 0; else if (pct >= 70) Xi = 2; else if (pct >= 50) Xi = 5; else if (pct >= 30) Xi = 7;
        sumTerms += (10 - Xi);
      }
    });
    score1_2 = sumTerms / data.selectedToolIds.length;
  }

  // --- 1.1.3 Documentation ---
  const score1_3 = data.documentedItems;
  details.part1 = Math.min(60, Math.round((score1_1 + score1_2 + score1_3) * 10) / 10);

  // --- 1.2 Detection (20 分) ---
  // PDF: 1.2.1 Accuracy (10), 1.2.2 Discovery (10). Total 20.
  const earlyBonus = Math.min(5, data.earlyDetectionCount * 1);
  const accuracyScore = Number(data.accuracyRate);
  const discoveryScore = Number(data.discoveryRate);
  details.part2 = Math.min(20, accuracyScore + discoveryScore + earlyBonus);

  // --- 1.3 Alerts (10 分) ---
  let score3 = 10;
  if (!data.opsLeadConfigured) score3 -= 5;
  if (data.dataMonitorConfigured === 'na') score3 -= 5; 
  else if (data.dataMonitorConfigured === 'missing') score3 -= 2;
  score3 -= (data.mismatchedAlertsCount * 1);
  score3 -= (data.missingMonitorItems * 1);
  details.part3 = Math.max(0, score3);

  // --- 1.4 Team (10 分) ---
  let score4 = 10;
  score4 -= (data.lateResponseCount * 2.5);
  score4 -= (data.overdueCount * 1);
  details.part4 = Math.max(0, score4);

  details.total = Math.round((details.part1 + details.part2 + details.part3 + details.part4) * 10) / 10;
  return details;
};

// --- Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>{children}</div>
);

const Accordion = ({ title, score, total, children, defaultOpen = false }: { title: string, score: number, total: number, children: React.ReactNode, defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const scoreColor = score >= total * 0.9 ? 'text-green-600' : score >= total * 0.7 ? 'text-blue-600' : 'text-red-500';
  
  return (
    <Card className="mb-4">
      <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-2">
          <span className={`transform transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
          <h3 className="font-bold text-slate-700">{title}</h3>
        </div>
        <div className="font-mono font-bold"><span className={scoreColor}>{score}</span> <span className="text-slate-400 text-sm">/ {total}</span></div>
      </div>
      {isOpen && <div className="p-5 animate-in slide-in-from-top-2 duration-200">{children}</div>}
    </Card>
  );
}

// --- Config View ---

const ConfigView = ({ tools, setTools }: { tools: MonitorTool[], setTools: (t: MonitorTool[]) => void }) => {
  const [activeToolId, setActiveToolId] = useState<string>(tools[0]?.id || '');
  const activeTool = tools.find(t => t.id === activeToolId);
  const [newScenario, setNewScenario] = useState<{cat: MonitorCategory, metric: string, level: MonitorLevel, threshold: string}>({
    cat: 'host', metric: '', level: 'orange', threshold: ''
  });

  const updateTool = (id: string, updates: Partial<MonitorTool>) => {
    setTools(tools.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const addScenario = () => {
    if (!activeTool || !newScenario.metric) return;
    const scenario: Scenario = { id: `scen_${Date.now()}`, category: newScenario.cat, metric: newScenario.metric, level: newScenario.level, threshold: newScenario.threshold };
    updateTool(activeTool.id, { scenarios: [...activeTool.scenarios, scenario] });
    setNewScenario({ ...newScenario, metric: '', threshold: '' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
      <div className="lg:col-span-1 border-r pr-4 space-y-2">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-700">工具列表</h3>
          <button onClick={() => {
            const name = prompt("工具名称:");
            if(name) setTools([...tools, { id: `t_${Date.now()}`, name, defaultCapabilities: [], scenarios: [] }]);
          }} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">+ 新增</button>
        </div>
        {tools.map(t => (
          <div key={t.id} onClick={() => setActiveToolId(t.id)} className={`p-3 rounded cursor-pointer ${activeToolId === t.id ? 'bg-blue-50 border-blue-200 text-blue-700' : 'hover:bg-slate-50'}`}>
            <div className="font-medium">{t.name}</div>
            <div className="text-xs text-slate-500">{t.scenarios.length} 指标</div>
          </div>
        ))}
      </div>
      <div className="lg:col-span-3">
        {activeTool ? (
          <div className="space-y-6">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">基础信息</label>
              <div className="flex gap-4 mt-2">
                <input value={activeTool.name} onChange={e => updateTool(activeTool.id, {name: e.target.value})} className="border rounded px-3 py-2 font-bold" />
                <button onClick={() => { if(confirm("删除?")) setTools(tools.filter(t => t.id !== activeTool.id)); }} className="text-red-500 text-sm">删除工具</button>
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                {Object.keys(CATEGORY_LABELS).map(k => {
                  const cap = k as MonitorCategory;
                  const has = activeTool.defaultCapabilities.includes(cap);
                  return <button key={k} onClick={() => updateTool(activeTool.id, { defaultCapabilities: has ? activeTool.defaultCapabilities.filter(c=>c!==cap) : [...activeTool.defaultCapabilities, cap] })} 
                    className={`text-xs px-2 py-1 rounded border ${has ? 'bg-blue-600 text-white' : 'bg-white'}`}>{CATEGORY_LABELS[cap]}</button>
                })}
              </div>
            </div>
            <div className="border-t pt-4">
              <h4 className="font-bold mb-4">标准指标 ({activeTool.scenarios.length})</h4>
              <div className="grid grid-cols-5 gap-2 mb-4">
                 <select value={newScenario.cat} onChange={e => setNewScenario({...newScenario, cat: e.target.value as any})} className="border rounded text-sm"><option value="host">主机</option><option value="trans">交易</option></select>
                 <input placeholder="指标名称" value={newScenario.metric} onChange={e => setNewScenario({...newScenario, metric: e.target.value})} className="col-span-2 border rounded text-sm px-2" />
                 <input placeholder="阈值" value={newScenario.threshold} onChange={e => setNewScenario({...newScenario, threshold: e.target.value})} className="border rounded text-sm px-2" />
                 <button onClick={addScenario} className="bg-blue-600 text-white rounded text-sm">添加</button>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {activeTool.scenarios.map(s => (
                  <div key={s.id} className="flex justify-between items-center p-2 bg-slate-50 rounded text-sm border">
                    <span><span className="font-bold text-slate-500">[{CATEGORY_LABELS[s.category]}]</span> {s.metric} ({s.threshold})</span>
                    <button onClick={() => updateTool(activeTool.id, { scenarios: activeTool.scenarios.filter(sc => sc.id !== s.id) })} className="text-red-500">×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <div className="text-slate-400">选择左侧工具编辑</div>}
      </div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [systems, setSystems] = useState<SystemData[]>([INITIAL_SYSTEM]);
  const [tools, setTools] = useState<MonitorTool[]>(DEFAULT_TOOLS);
  const [activeSystemId, setActiveSystemId] = useState<string>(INITIAL_SYSTEM.id);
  const [view, setView] = useState<'dashboard' | 'scoring' | 'config'>('scoring');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeSystem = useMemo(() => systems.find(s => s.id === activeSystemId) || systems[0], [systems, activeSystemId]);
  const scores = useMemo(() => calculateScore(activeSystem, tools), [activeSystem, tools]);

  // Load Data
  useEffect(() => {
    setLoading(true);
    api.load().then(data => {
      if (data) {
        if(data.systems?.length) setSystems(data.systems);
        if(data.tools?.length) setTools(data.tools);
        // If data loaded, set active to first
        if(data.systems?.length) setActiveSystemId(data.systems[0].id);
      }
      setLoading(false);
    });
  }, []);

  // Save Data
  const saveData = async () => {
    setSaving(true);
    const success = await api.save({ systems, tools, lastUpdated: Date.now() });
    setTimeout(() => setSaving(false), 500);
    if (!success) alert("保存失败，请检查网络");
  };

  const updateSystem = (updates: Partial<SystemData>) => {
    setSystems(prev => prev.map(s => s.id === activeSystemId ? { ...s, ...updates } : s));
  };

  const toggleTool = (toolId: string) => {
    const current = activeSystem.selectedToolIds;
    if (current.includes(toolId)) {
      updateSystem({ 
        selectedToolIds: current.filter(id => id !== toolId),
        toolCapabilities: { ...activeSystem.toolCapabilities, [toolId]: [] }
      });
    } else {
      const tool = tools.find(t => t.id === toolId);
      updateSystem({ 
        selectedToolIds: [...current, toolId],
        toolCapabilities: { ...activeSystem.toolCapabilities, [toolId]: tool?.defaultCapabilities || [] }
      });
    }
  };

  return (
    <div className="min-h-screen pb-12 font-sans text-slate-800 bg-slate-50/50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">M</div>
             <h1 className="font-bold text-lg hidden md:block">监控评分协作台</h1>
             {loading && <span className="text-xs text-slate-400">加载中...</span>}
          </div>
          <div className="flex items-center gap-4">
             <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setView('scoring')} className={`px-3 py-1.5 rounded text-sm font-medium ${view==='scoring'?'bg-white shadow-sm text-blue-600':''}`}>评分</button>
                <button onClick={() => setView('config')} className={`px-3 py-1.5 rounded text-sm font-medium ${view==='config'?'bg-white shadow-sm text-blue-600':''}`}>配置</button>
                <button onClick={() => setView('dashboard')} className={`px-3 py-1.5 rounded text-sm font-medium ${view==='dashboard'?'bg-white shadow-sm text-blue-600':''}`}>报表</button>
             </div>
             <button onClick={saveData} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2">
                {saving ? '同步中...' : '☁️ 提交保存'}
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {view === 'config' && (
          <Card className="p-6 h-[calc(100vh-140px)]">
             <ConfigView tools={tools} setTools={setTools} />
          </Card>
        )}

        {view === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {systems.map(sys => {
              const s = calculateScore(sys, tools);
              return (
                <Card key={sys.id} className="p-6 hover:shadow-md transition-all cursor-pointer">
                  <div onClick={() => { setActiveSystemId(sys.id); setView('scoring'); }}>
                    <div className="flex justify-between items-start mb-4">
                       <h3 className="font-bold text-lg">{sys.name}</h3>
                       <span className={`px-2 py-0.5 rounded text-xs ${sys.tier === 'A' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{sys.tier}类</span>
                    </div>
                    <div className="text-3xl font-black text-blue-600 mb-4">{s.total}</div>
                    <div className="space-y-1 text-sm text-slate-500">
                       <div className="flex justify-between"><span>配置</span><span>{s.part1}</span></div>
                       <div className="flex justify-between"><span>检测</span><span>{s.part2}</span></div>
                       <div className="flex justify-between"><span>告警</span><span>{s.part3}</span></div>
                       <div className="flex justify-between"><span>团队</span><span>{s.part4}</span></div>
                    </div>
                  </div>
                </Card>
              )
            })}
             <button onClick={() => {
                const name = prompt("系统名称:");
                if(name) setSystems([...systems, { ...INITIAL_SYSTEM, id: `sys_${Date.now()}`, name }]);
             }} className="border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 hover:border-blue-500 hover:text-blue-500 transition-colors p-6">
               + 新增系统
             </button>
          </div>
        )}

        {view === 'scoring' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-3 space-y-4">
              <div className="flex justify-between items-center px-1">
                 <h3 className="font-bold text-slate-700">评分对象 ({systems.length})</h3>
                 <button onClick={() => {
                    const name = prompt("系统名称:");
                    if(name) setSystems([...systems, { ...INITIAL_SYSTEM, id: `sys_${Date.now()}`, name }]);
                 }} className="text-blue-600 text-xs bg-blue-50 px-2 py-1 rounded">+ 新增</button>
              </div>
              <div className="space-y-2 max-h-[80vh] overflow-y-auto">
                {systems.map(sys => (
                  <div key={sys.id} onClick={() => setActiveSystemId(sys.id)} 
                    className={`p-3 rounded border cursor-pointer ${activeSystemId === sys.id ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-white border-transparent hover:bg-white hover:border-slate-300'}`}>
                    <div className="font-bold text-slate-800">{sys.name}</div>
                    <div className="text-xs text-slate-500 mt-1 flex justify-between">
                       <span>{sys.tier}类系统</span>
                       <span className="font-mono">{calculateScore(sys, tools).total} 分</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-9 space-y-4">
              <div className="flex justify-between items-start mb-6">
                 <div>
                   <input value={activeSystem.name} onChange={e => updateSystem({name: e.target.value})} className="text-2xl font-bold border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent" />
                   <div className="flex gap-4 mt-2">
                      <select value={activeSystem.tier} onChange={e => updateSystem({tier: e.target.value as any})} className="text-sm bg-slate-50 border-none rounded px-2 py-1">
                         <option value="A">A类核心系统</option><option value="B">B类重要系统</option><option value="C">C类一般系统</option>
                      </select>
                      <span className="text-sm text-slate-400 py-1">ID: {activeSystem.id}</span>
                   </div>
                 </div>
                 <div className="text-right">
                    <div className="text-5xl font-black text-blue-600">{scores.total}</div>
                 </div>
              </div>

              {/* Accordion 1: Configuration (60 pts) */}
              <Accordion title="1. 配置完整性与标准化" score={scores.part1} total={60} defaultOpen={true}>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div>
                      <h4 className="font-bold text-sm text-slate-500 mb-3">1.1.1 监控工具接入</h4>
                      <div className="space-y-2 mb-4">
                         {tools.map(t => (
                           <div key={t.id} className={`flex flex-col p-2 rounded border ${activeSystem.selectedToolIds.includes(t.id) ? 'bg-blue-50 border-blue-200' : 'border-slate-100'}`}>
                              <div className="flex justify-between items-center">
                                <label className="flex items-center gap-2 cursor-pointer">
                                   <input type="checkbox" checked={activeSystem.selectedToolIds.includes(t.id)} onChange={() => toggleTool(t.id)} />
                                   <span className="text-sm font-medium">{t.name}</span>
                                </label>
                              </div>
                              {activeSystem.selectedToolIds.includes(t.id) && (
                                 <div className="flex gap-1 mt-2 flex-wrap">
                                    {t.defaultCapabilities.map(c => (
                                       <span key={c} onClick={() => {
                                          const caps = activeSystem.toolCapabilities[t.id] || [];
                                          const newCaps = caps.includes(c) ? caps.filter(x=>x!==c) : [...caps, c];
                                          updateSystem({ toolCapabilities: { ...activeSystem.toolCapabilities, [t.id]: newCaps } });
                                       }} className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer border select-none ${ (activeSystem.toolCapabilities[t.id]||[]).includes(c) ? 'bg-blue-600 text-white' : 'bg-white text-slate-500' }`}>
                                          {CATEGORY_LABELS[c]}
                                       </span>
                                    ))}
                                 </div>
                              )}
                           </div>
                         ))}
                      </div>
                      <div className="text-sm space-y-3 bg-slate-50 p-3 rounded">
                         <div className="flex justify-between items-center">
                            <span>服务器/服务覆盖率</span>
                            <select value={activeSystem.serverCoverage} onChange={e => updateSystem({serverCoverage: e.target.value as any})} className="border rounded text-xs p-1">
                               <option value="full">完全覆盖 (100%)</option><option value="basic">基本覆盖 (70%)</option><option value="partial">部分覆盖 (50%)</option><option value="low">低度覆盖 (30%)</option>
                            </select>
                         </div>
                         <label className="flex items-center gap-2"><input type="checkbox" checked={activeSystem.isSelfBuilt} onChange={e => updateSystem({isSelfBuilt: e.target.checked})} /> 存在自建监控 (+5分)</label>
                         <div className="flex items-center justify-between">
                            <span>监控文档化 (0-5分)</span>
                            <input type="number" min="0" max="5" value={activeSystem.documentedItems} onChange={e => updateSystem({documentedItems: Number(e.target.value)})} className="w-12 border rounded text-center" />
                         </div>
                      </div>
                   </div>
                   
                   <div>
                      <h4 className="font-bold text-sm text-slate-500 mb-3">1.1.2 指标标准化检查</h4>
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                        {activeSystem.selectedToolIds.length === 0 && <div className="text-sm text-slate-400">请先在左侧选择接入的工具</div>}
                        {activeSystem.selectedToolIds.map(tid => {
                           const tool = tools.find(t => t.id === tid);
                           if(!tool) return null;
                           const caps = activeSystem.toolCapabilities[tid] || [];
                           const scens = tool.scenarios.filter(s => caps.includes(s.category));
                           if(scens.length === 0) return null;
                           return (
                              <div key={tid} className="border rounded bg-white p-3 text-sm">
                                 <div className="font-bold mb-2 text-slate-600 border-b pb-1">{tool.name}</div>
                                 <div className="space-y-1">
                                    {scens.map(s => (
                                       <label key={s.id} className="flex items-start gap-2 hover:bg-slate-50 p-1 rounded cursor-pointer">
                                          <input type="checkbox" checked={activeSystem.checkedScenarioIds.includes(s.id)} onChange={() => {
                                             const current = activeSystem.checkedScenarioIds;
                                             updateSystem({ checkedScenarioIds: current.includes(s.id) ? current.filter(x=>x!==s.id) : [...current, s.id] });
                                          }} className="mt-1" />
                                          <div>
                                             <div className="font-medium text-slate-700">{s.metric}</div>
                                             <div className="text-xs text-slate-400">{s.threshold}</div>
                                          </div>
                                       </label>
                                    ))}
                                 </div>
                              </div>
                           )
                        })}
                      </div>
                   </div>
                 </div>
              </Accordion>

              {/* Accordion 2: Detection (20 pts) */}
              <Accordion title="2. 故障检测能力" score={scores.part2} total={20} defaultOpen={true}>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                       <div className="mb-4">
                          <label className="block mb-2 font-medium text-sm">监控准确率 (10分)</label>
                          <select value={activeSystem.accuracyRate} onChange={e => updateSystem({accuracyRate: Number(e.target.value) as any})} className="w-full border p-2 rounded text-sm bg-white">
                             <option value={10}>10分 - 极高准确率 [99%, 100%)</option>
                             <option value={7}>7分 - 高准确率 [95%, 99%)</option>
                             <option value={3}>3分 - 中等准确率 [90%, 95%)</option>
                             <option value={0}>0分 - 低准确率 &lt;90%</option>
                          </select>
                       </div>
                       <div>
                          <label className="block mb-2 font-medium text-sm">故障发现率 (10分)</label>
                          <select value={activeSystem.discoveryRate} onChange={e => updateSystem({discoveryRate: Number(e.target.value) as any})} className="w-full border p-2 rounded text-sm bg-white">
                             <option value={10}>10分 - 非常高 [99%, 100%)</option>
                             <option value={7}>7分 - 较高 [95%, 99%)</option>
                             <option value={3}>3分 - 中等 [85%, 95%)</option>
                             <option value={0}>0分 - 低 &lt;85%</option>
                          </select>
                       </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded text-sm space-y-4">
                       <h4 className="font-bold text-slate-500 text-xs uppercase">检测数据记录 (不直接计分)</h4>
                       <div className="grid grid-cols-2 gap-4">
                          <label>
                             <span className="block text-slate-500 text-xs mb-1">平均检测时长(分)</span>
                             <input type="number" value={activeSystem.avgDetectionTime} onChange={e => updateSystem({avgDetectionTime: Number(e.target.value)})} className="w-full border rounded p-1" />
                          </label>
                          <label>
                             <span className="block text-slate-500 text-xs mb-1">最大检测时长(分)</span>
                             <input type="number" value={activeSystem.maxDetectionTime} onChange={e => updateSystem({maxDetectionTime: Number(e.target.value)})} className="w-full border rounded p-1" />
                          </label>
                       </div>
                       <label className="block">
                          <span className="block text-slate-500 text-xs mb-1">提前发现故障次数 (每1次+1分, 上限5分)</span>
                          <input type="number" value={activeSystem.earlyDetectionCount} onChange={e => updateSystem({earlyDetectionCount: Number(e.target.value)})} className="w-full border rounded p-1" />
                       </label>
                       <div className="text-right text-xs text-green-600 font-bold">加分: +{Math.min(5, activeSystem.earlyDetectionCount)}</div>
                    </div>
                 </div>
              </Accordion>

              {/* Accordion 3: Alerts & Team (20 pts) */}
              <Accordion title="3. 告警配置与运维团队" score={scores.part3 + scores.part4} total={20} defaultOpen={true}>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Alerts 1.3 */}
                    <div className="space-y-4">
                       <h4 className="font-bold text-slate-700 text-sm border-b pb-2">3. 告警配置 (10分)</h4>
                       <div className="space-y-3 text-sm">
                          <label className="flex items-center gap-2 border p-2 rounded cursor-pointer hover:bg-slate-50">
                             <input type="checkbox" checked={activeSystem.opsLeadConfigured} onChange={e => updateSystem({opsLeadConfigured: e.target.checked})} />
                             <span className="flex-1">科管运维负责人配置 (5分)</span>
                             {!activeSystem.opsLeadConfigured && <span className="text-red-500 text-xs font-bold">-5</span>}
                          </label>
                          
                          <div className="border p-2 rounded">
                             <div className="mb-1 text-slate-600">数据级监控告警人配置</div>
                             <select value={activeSystem.dataMonitorConfigured} onChange={e => updateSystem({dataMonitorConfigured: e.target.value as any})} className="w-full border rounded p-1 text-xs">
                                <option value="full">配置齐全 (5分)</option>
                                <option value="missing">存在遗漏 (3分)</option>
                                <option value="na">未接入/未配置 (0分)</option>
                             </select>
                          </div>

                          <label className="flex items-center justify-between border p-2 rounded bg-red-50/50 border-red-100">
                             <span className="text-slate-600">告警级别不符数 (扣分)</span>
                             <div className="flex items-center gap-2">
                                <input type="number" min="0" value={activeSystem.mismatchedAlertsCount} onChange={e => updateSystem({mismatchedAlertsCount: Number(e.target.value)})} className="w-12 border rounded text-center text-red-600 font-bold" />
                                <span className="text-red-500 text-xs">-{activeSystem.mismatchedAlertsCount}</span>
                             </div>
                          </label>
                       </div>
                    </div>

                    {/* Team 1.4 */}
                    <div className="space-y-4">
                       <h4 className="font-bold text-slate-700 text-sm border-b pb-2">4. 运维团队 (10分)</h4>
                       <div className="space-y-3 text-sm">
                          <div className="bg-slate-50 p-3 rounded">
                             <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-slate-700">响应能力 (5分)</span>
                                <span className="text-xs text-slate-400">每次超时扣 2.5分</span>
                             </div>
                             <label className="flex items-center justify-between">
                                <span>超时响应次数</span>
                                <div className="flex items-center gap-2">
                                   <input type="number" min="0" value={activeSystem.lateResponseCount} onChange={e => updateSystem({lateResponseCount: Number(e.target.value)})} className="w-12 border rounded text-center" />
                                   <span className="text-red-500 text-xs font-bold">-{activeSystem.lateResponseCount * 2.5}</span>
                                </div>
                             </label>
                          </div>

                          <div className="bg-slate-50 p-3 rounded">
                             <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-slate-700">整改情况 (5分)</span>
                                <span className="text-xs text-slate-400">每次逾期扣 1分</span>
                             </div>
                             <label className="flex items-center justify-between">
                                <span>整改逾期项数</span>
                                <div className="flex items-center gap-2">
                                   <input type="number" min="0" value={activeSystem.overdueCount} onChange={e => updateSystem({overdueCount: Number(e.target.value)})} className="w-12 border rounded text-center" />
                                   <span className="text-red-500 text-xs font-bold">-{activeSystem.overdueCount}</span>
                                </div>
                             </label>
                          </div>
                       </div>
                    </div>
                 </div>
              </Accordion>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
