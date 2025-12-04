
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
  
  // 1.1.1 Configuration (User Inputs)
  isSelfBuilt: boolean; // +5 bonus
  serverCoverage: 'full' | 'basic' | 'partial' | 'low'; // Server scope coverage
  
  // Tool Selection & Capabilities
  selectedToolIds: string[];
  // Which capabilities are actually USED for this system per tool
  toolCapabilities: Record<string, MonitorCategory[]>; 

  // 1.1.2 Standardization
  checkedScenarioIds: string[]; // IDs of checked metrics

  // 1.1.3 Documentation
  documentedItems: number; // 0-5

  // 1.2 Detection
  accuracy: 'perfect' | 'high' | 'medium' | 'low'; 
  discoveryRate: 'perfect' | 'high' | 'medium' | 'low'; 
  
  // 1.3 Alerts
  opsLeadConfigured: 'full' | 'missing'; 
  dataMonitorConfigured: 'full' | 'missing' | 'na'; 
  missingMonitorItems: number; 

  // 1.4 Team
  lateResponseCount: number;
  overdueCount: number;
}

// --- Configuration Data ---

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
      { id: 'z3', category: 'host', metric: '磁盘使用率', level: 'orange', threshold: '>90%' },
      { id: 'z4', category: 'network', metric: 'Ping不可达', level: 'orange', threshold: 'Down' },
    ]
  },
  {
    id: 'prometheus', name: 'Prometheus', defaultCapabilities: ['host', 'process', 'trans'],
    scenarios: [
      { id: 'p1', category: 'host', metric: 'JVM Heap使用率', level: 'yellow', threshold: '>90%' },
      { id: 'p2', category: 'trans', metric: '接口QPS突增', level: 'yellow', threshold: '>50%' },
      { id: 'p3', category: 'trans', metric: '接口响应时间', level: 'yellow', threshold: '>2s' },
    ]
  },
  {
    id: 'rms', name: 'RMS (业务监控)', defaultCapabilities: ['trans', 'link'],
    scenarios: [
      { id: 'r1', category: 'trans', metric: '核心交易成功率', level: 'red', threshold: '<99%' },
      { id: 'r2', category: 'trans', metric: '交易量跌零', level: 'red', threshold: '0' },
      { id: 'r3', category: 'link', metric: '全链路Trace丢失', level: 'yellow', threshold: '>5%' },
    ]
  },
  {
    id: 'oracle_em', name: 'Oracle EM', defaultCapabilities: ['db'],
    scenarios: [
      { id: 'o1', category: 'db', metric: '表空间使用率', level: 'orange', threshold: '>90%' },
      { id: 'o2', category: 'db', metric: '慢SQL数量', level: 'yellow', threshold: '>10' },
    ]
  },
  {
    id: 'f5', name: 'F5', defaultCapabilities: ['network'],
    scenarios: [
      { id: 'f1', category: 'network', metric: '连接数满', level: 'red', threshold: '100%' },
    ]
  }
];

const INITIAL_SYSTEM: SystemData = {
  id: 'sys_1', name: '基金代销系统', tier: 'A',
  isSelfBuilt: false,
  serverCoverage: 'full',
  selectedToolIds: ['zabbix', 'prometheus'],
  toolCapabilities: {
    'zabbix': ['host', 'process'],
    'prometheus': ['trans']
  },
  checkedScenarioIds: ['z1', 'z2', 'p1'],
  documentedItems: 5,
  accuracy: 'high',
  discoveryRate: 'high',
  opsLeadConfigured: 'full',
  dataMonitorConfigured: 'full',
  missingMonitorItems: 0,
  lateResponseCount: 0,
  overdueCount: 0
};

// --- Helper Functions ---

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

  // --- 1.1.1 Package Coverage Calculation (Auto) ---
  // 1. Determine covered capabilities
  const coveredCaps = new Set<MonitorCategory>();
  data.selectedToolIds.forEach(tid => {
    const caps = data.toolCapabilities[tid] || [];
    caps.forEach(c => coveredCaps.add(c));
  });

  // 2. Check Mandatory coverage
  const missingCaps = MANDATORY_CAPS.filter(c => !coveredCaps.has(c));
  details.missingCaps = missingCaps;

  // 3. Determine Package Coverage Level
  // Logic inferred: 100% -> Full, >=70% (miss 1) -> Basic, >=50% (miss 2) -> Partial, else Low
  const coveragePct = (MANDATORY_CAPS.length - missingCaps.length) / MANDATORY_CAPS.length;
  let pkgDeduction = 0;
  
  if (coveragePct === 1) { details.packageLevel = 'full'; pkgDeduction = 0; }
  else if (coveragePct >= 0.7) { details.packageLevel = 'basic'; pkgDeduction = 4; }
  else if (coveragePct >= 0.5) { details.packageLevel = 'partial'; pkgDeduction = 7; }
  else { details.packageLevel = 'low'; pkgDeduction = 10; }

  // 4. Calculate Score 1.1.1
  let score1_1 = 45;
  score1_1 -= pkgDeduction;
  score1_1 -= (missingCaps.length * 15); // Specific component deduction
  score1_1 -= { 'full': 0, 'basic': 5, 'partial': 10, 'low': 15 }[data.serverCoverage]; // Server coverage
  if (data.isSelfBuilt) score1_1 += 5;
  score1_1 = Math.max(0, score1_1);

  // --- 1.1.2 Standardization Calculation (Auto) ---
  let score1_2 = 0;
  if (data.selectedToolIds.length > 0) {
    let sumTerms = 0;
    data.selectedToolIds.forEach(tid => {
      const tool = tools.find(t => t.id === tid);
      if (!tool) return;
      
      // Filter scenarios relevant to enabled capabilities
      const enabledCaps = data.toolCapabilities[tid] || [];
      const relevantScenarios = tool.scenarios.filter(s => enabledCaps.includes(s.category));
      
      if (relevantScenarios.length === 0) {
        sumTerms += 10; 
      } else {
        const checkedCount = relevantScenarios.filter(s => data.checkedScenarioIds.includes(s.id)).length;
        const pct = (checkedCount / relevantScenarios.length) * 100;
        
        let Xi = 10;
        if (pct >= 99) Xi = 0;
        else if (pct >= 70) Xi = 2;
        else if (pct >= 50) Xi = 5;
        else if (pct >= 30) Xi = 7;
        
        sumTerms += (10 - Xi);
      }
    });
    score1_2 = sumTerms / data.selectedToolIds.length;
  }

  // --- 1.1.3 Documentation ---
  const score1_3 = data.documentedItems;

  details.part1 = Math.min(60, Math.round((score1_1 + score1_2 + score1_3) * 10) / 10);

  // --- Other Parts ---
  const accScore = { 'perfect': 10, 'high': 7, 'medium': 3, 'low': 0 }[data.accuracy];
  const discScore = { 'perfect': 10, 'high': 7, 'medium': 3, 'low': 0 }[data.discoveryRate];
  details.part2 = accScore + discScore;

  let score3 = 0;
  if (data.opsLeadConfigured === 'full') score3 += 5;
  if (data.dataMonitorConfigured === 'full') score3 += 5;
  else if (data.dataMonitorConfigured === 'na') score3 -= 5;
  score3 -= data.missingMonitorItems;
  details.part3 = Math.max(0, score3);

  let score4 = Math.max(0, 5 - data.lateResponseCount * 2.5) + Math.max(0, 5 - data.overdueCount);
  details.part4 = score4;

  details.total = Math.round((details.part1 + details.part2 + details.part3 + details.part4) * 10) / 10;
  return details;
};

// --- Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

const Badge = ({ children, color = "blue" }: { children: React.ReactNode; color?: string }) => {
  const colors: any = {
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    yellow: "bg-yellow-100 text-yellow-800",
    gray: "bg-slate-100 text-slate-800",
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[color] || colors.gray}`}>{children}</span>;
};

// --- Config View Components ---

const ConfigView = ({ tools, setTools }: { tools: MonitorTool[], setTools: (t: MonitorTool[]) => void }) => {
  const [activeToolId, setActiveToolId] = useState<string>(tools[0]?.id || '');
  const activeTool = tools.find(t => t.id === activeToolId);

  const [newScenario, setNewScenario] = useState<{cat: MonitorCategory, metric: string, level: MonitorLevel, threshold: string}>({
    cat: 'host', metric: '', level: 'orange', threshold: ''
  });

  const addTool = () => {
    const name = prompt("请输入新工具名称:");
    if (!name) return;
    const newTool: MonitorTool = {
      id: `tool_${Date.now()}`,
      name,
      defaultCapabilities: [],
      scenarios: []
    };
    setTools([...tools, newTool]);
    setActiveToolId(newTool.id);
  };

  const deleteTool = (id: string) => {
    if (confirm("确定删除该工具吗？所有关联的评分数据可能会受到影响。")) {
      setTools(tools.filter(t => t.id !== id));
      if (activeToolId === id) setActiveToolId(tools[0]?.id || '');
    }
  };

  const updateTool = (id: string, updates: Partial<MonitorTool>) => {
    setTools(tools.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const toggleDefaultCap = (cap: MonitorCategory) => {
    if (!activeTool) return;
    const caps = activeTool.defaultCapabilities.includes(cap)
      ? activeTool.defaultCapabilities.filter(c => c !== cap)
      : [...activeTool.defaultCapabilities, cap];
    updateTool(activeTool.id, { defaultCapabilities: caps });
  };

  const addScenario = () => {
    if (!activeTool || !newScenario.metric) return;
    const scenario: Scenario = {
      id: `scen_${Date.now()}`,
      category: newScenario.cat,
      metric: newScenario.metric,
      level: newScenario.level,
      threshold: newScenario.threshold
    };
    updateTool(activeTool.id, { scenarios: [...activeTool.scenarios, scenario] });
    setNewScenario({ ...newScenario, metric: '', threshold: '' }); // reset
  };

  const deleteScenario = (scenId: string) => {
    if (!activeTool) return;
    updateTool(activeTool.id, { scenarios: activeTool.scenarios.filter(s => s.id !== scenId) });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Sidebar Tool List */}
      <div className="lg:col-span-1 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-slate-700">工具列表</h3>
          <button onClick={addTool} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">+ 新增</button>
        </div>
        <div className="space-y-2">
          {tools.map(tool => (
            <div 
              key={tool.id} 
              onClick={() => setActiveToolId(tool.id)}
              className={`p-3 rounded-lg border cursor-pointer flex justify-between items-center group transition-all ${activeToolId === tool.id ? 'bg-white border-blue-500 shadow-sm ring-1 ring-blue-500/20' : 'bg-white border-transparent hover:bg-slate-50'}`}
            >
              <span className="font-medium text-slate-900">{tool.name}</span>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{tool.scenarios.length} 指标</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Config Area */}
      <div className="lg:col-span-3 space-y-6">
        {activeTool ? (
          <>
            <Card className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">工具名称</label>
                  <input 
                    type="text" 
                    value={activeTool.name}
                    onChange={(e) => updateTool(activeTool.id, { name: e.target.value })}
                    className="text-xl font-bold border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent"
                  />
                </div>
                <button onClick={() => deleteTool(activeTool.id)} className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded text-sm transition-colors">删除工具</button>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-3">默认支持能力 (Capabilities)</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(CATEGORY_LABELS).map((key) => {
                    const cap = key as MonitorCategory;
                    const isActive = activeTool.defaultCapabilities.includes(cap);
                    return (
                      <button
                        key={cap}
                        onClick={() => toggleDefaultCap(cap)}
                        className={`px-3 py-1.5 rounded text-sm border transition-all ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                      >
                        {CATEGORY_LABELS[cap]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="mb-4 flex justify-between items-center">
                <h3 className="font-bold text-lg">标准监控指标配置</h3>
                <span className="text-xs text-slate-500">共 {activeTool.scenarios.length} 项</span>
              </div>

              {/* Add Scenario Form */}
              <div className="bg-slate-50 p-4 rounded-lg mb-4 border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">分类</label>
                  <select 
                    value={newScenario.cat}
                    onChange={(e) => setNewScenario({...newScenario, cat: e.target.value as MonitorCategory})}
                    className="w-full text-sm border rounded px-2 py-1.5"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-4">
                  <label className="block text-xs font-medium text-slate-500 mb-1">指标名称</label>
                  <input 
                    type="text" 
                    value={newScenario.metric}
                    onChange={(e) => setNewScenario({...newScenario, metric: e.target.value})}
                    placeholder="例如: CPU使用率"
                    className="w-full text-sm border rounded px-2 py-1.5"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">阈值描述</label>
                  <input 
                    type="text" 
                    value={newScenario.threshold}
                    onChange={(e) => setNewScenario({...newScenario, threshold: e.target.value})}
                    placeholder=">90%"
                    className="w-full text-sm border rounded px-2 py-1.5"
                  />
                </div>
                <div className="md:col-span-2">
                   <label className="block text-xs font-medium text-slate-500 mb-1">告警级别</label>
                   <select 
                    value={newScenario.level}
                    onChange={(e) => setNewScenario({...newScenario, level: e.target.value as MonitorLevel})}
                    className="w-full text-sm border rounded px-2 py-1.5"
                  >
                    <option value="red">🔴 红色 (P0)</option>
                    <option value="orange">🟠 橙色 (P1)</option>
                    <option value="yellow">🟡 黄色 (P2)</option>
                    <option value="gray">⚪ 灰色 (Log)</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <button onClick={addScenario} className="w-full bg-blue-600 text-white text-sm py-1.5 rounded hover:bg-blue-700 font-medium">添加指标</button>
                </div>
              </div>

              {/* Scenarios List */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                    <tr>
                      <th className="px-4 py-2">分类</th>
                      <th className="px-4 py-2">指标名称</th>
                      <th className="px-4 py-2">阈值</th>
                      <th className="px-4 py-2">级别</th>
                      <th className="px-4 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeTool.scenarios.map(scen => (
                      <tr key={scen.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-600">{CATEGORY_LABELS[scen.category]}</td>
                        <td className="px-4 py-2 font-medium">{scen.metric}</td>
                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">{scen.threshold}</td>
                        <td className="px-4 py-2">
                          <Badge color={scen.level === 'red' ? 'red' : scen.level === 'orange' ? 'yellow' : 'gray'}>
                             {scen.level.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => deleteScenario(scen.id)} className="text-slate-400 hover:text-red-500">×</button>
                        </td>
                      </tr>
                    ))}
                    {activeTool.scenarios.length === 0 && (
                       <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">暂无标准指标，请在上方添加</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">请选择左侧工具进行配置</div>
        )}
      </div>
    </div>
  );
};

// --- Main App Component ---

const App = () => {
  const [systems, setSystems] = useState<SystemData[]>([INITIAL_SYSTEM]);
  const [activeSystemId, setActiveSystemId] = useState<string>(INITIAL_SYSTEM.id);
  const [tools, setTools] = useState<MonitorTool[]>(DEFAULT_TOOLS);
  const [view, setView] = useState<'dashboard' | 'scoring' | 'config'>('scoring');

  // Persistence for Systems
  useEffect(() => {
    const savedSys = localStorage.getItem('monitor_systems_v6');
    if (savedSys) setSystems(JSON.parse(savedSys));
    
    // Persistence for Tools
    const savedTools = localStorage.getItem('monitor_tools_v6');
    if (savedTools) setTools(JSON.parse(savedTools));
  }, []);

  useEffect(() => {
    localStorage.setItem('monitor_systems_v6', JSON.stringify(systems));
  }, [systems]);

  useEffect(() => {
    localStorage.setItem('monitor_tools_v6', JSON.stringify(tools));
  }, [tools]);

  const activeSystem = useMemo(() => systems.find(s => s.id === activeSystemId) || systems[0], [systems, activeSystemId]);
  const scores = useMemo(() => calculateScore(activeSystem, tools), [activeSystem, tools]);

  const updateSystem = (updates: Partial<SystemData>) => {
    setSystems(prev => prev.map(s => s.id === activeSystemId ? { ...s, ...updates } : s));
  };

  // Toggle tool selection
  const toggleTool = (toolId: string) => {
    const current = activeSystem.selectedToolIds;
    if (current.includes(toolId)) {
      updateSystem({ 
        selectedToolIds: current.filter(id => id !== toolId),
        // Clean up capabilities
        toolCapabilities: { ...activeSystem.toolCapabilities, [toolId]: [] }
      });
    } else {
      const tool = tools.find(t => t.id === toolId);
      updateSystem({ 
        selectedToolIds: [...current, toolId],
        // Default select all capabilities
        toolCapabilities: { ...activeSystem.toolCapabilities, [toolId]: tool?.defaultCapabilities || [] }
      });
    }
  };

  // Toggle capability for a specific tool
  const toggleToolCapability = (toolId: string, cap: MonitorCategory) => {
    const currentCaps = activeSystem.toolCapabilities[toolId] || [];
    const newCaps = currentCaps.includes(cap) 
      ? currentCaps.filter(c => c !== cap)
      : [...currentCaps, cap];
    
    updateSystem({
      toolCapabilities: { ...activeSystem.toolCapabilities, [toolId]: newCaps }
    });
  };

  // Toggle scenario check
  const toggleScenario = (id: string) => {
    const current = activeSystem.checkedScenarioIds;
    updateSystem({
      checkedScenarioIds: current.includes(id) ? current.filter(i => i !== id) : [...current, id]
    });
  };

  const addNewSystem = () => {
    const newId = `sys_${Date.now()}`;
    setSystems([...systems, { ...INITIAL_SYSTEM, id: newId, name: `新系统 ${newId.slice(-4)}` }]);
    setActiveSystemId(newId);
  };

  return (
    <div className="min-h-screen pb-12 font-sans text-slate-800 bg-slate-50/50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">M</div>
             <h1 className="font-bold text-lg">监控评分工作台</h1>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
             <button onClick={() => setView('scoring')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view==='scoring'?'bg-white text-blue-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>评分录入</button>
             <button onClick={() => setView('dashboard')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view==='dashboard'?'bg-white text-blue-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>总览报表</button>
             <button onClick={() => setView('config')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view==='config'?'bg-white text-blue-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>全局配置</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {view === 'config' ? (
          <ConfigView tools={tools} setTools={setTools} />
        ) : view === 'dashboard' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {systems.map(sys => {
              const s = calculateScore(sys, tools);
              return (
                <Card key={sys.id} className="p-6 hover:shadow-md cursor-pointer transition-all" >
                  <div onClick={() => { setActiveSystemId(sys.id); setView('scoring'); }}>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-lg">{sys.name}</h3>
                      <span className="text-2xl font-black text-blue-600">{s.total}</span>
                    </div>
                    <div className="space-y-2 text-sm text-slate-600">
                       <div className="flex justify-between"><span>覆盖 & 标准</span><span>{s.part1}/60</span></div>
                       <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div style={{width: `${(s.part1/60)*100}%`}} className="h-full bg-blue-500"></div></div>
                       <div className="flex justify-between pt-1"><span>检测能力</span><span>{s.part2}/20</span></div>
                       <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div style={{width: `${(s.part2/20)*100}%`}} className="h-full bg-green-500"></div></div>
                    </div>
                  </div>
                </Card>
              );
            })}
            <button onClick={addNewSystem} className="border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors p-6 min-h-[200px]">
               <span className="text-3xl mb-2">+</span>
               <span className="font-medium">新增系统评分</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-3 space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-slate-700">系统列表</h3>
                <button onClick={addNewSystem} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100">+ 新增</button>
              </div>
              <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                {systems.map(sys => (
                  <div key={sys.id} onClick={() => setActiveSystemId(sys.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${activeSystemId === sys.id ? 'bg-white border-blue-500 shadow-sm ring-1 ring-blue-500/20' : 'bg-white border-transparent hover:bg-white hover:border-slate-200'}`}
                  >
                    <div className="font-medium text-slate-900">{sys.name}</div>
                    <div className="flex justify-between mt-2 text-xs text-slate-500">
                      <span className={`px-1.5 rounded ${sys.tier === 'A' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>{sys.tier}类</span>
                      <span>{calculateScore(sys, tools).total}分</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scoring Form */}
            <div className="lg:col-span-9 space-y-6">
              {/* Basic Info */}
              <Card className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">1</div>
                  <div>
                    <h2 className="text-lg font-bold">基本信息</h2>
                    <p className="text-sm text-slate-500">设定系统的基本属性</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                   <div>
                     <label className="block text-sm font-medium mb-1">系统名称</label>
                     <input type="text" className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                       value={activeSystem.name} onChange={e => updateSystem({name: e.target.value})} />
                   </div>
                   <div>
                     <label className="block text-sm font-medium mb-1">系统等级</label>
                     <select className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                       value={activeSystem.tier} onChange={e => updateSystem({tier: e.target.value as any})}>
                       <option value="A">A类 (核心系统)</option>
                       <option value="B">B类 (重要系统)</option>
                       <option value="C">C类 (一般系统)</option>
                     </select>
                   </div>
                </div>
              </Card>

              {/* 1.1.1 Tool & Capability Selection */}
              <Card className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">1.1</div>
                    <div>
                      <h2 className="text-lg font-bold">监控配置完整性</h2>
                      <p className="text-sm text-slate-500">勾选已接入的工具及其覆盖能力，系统自动计算得分</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-blue-600">{scores.part1} <span className="text-sm font-normal text-slate-400">/ 60</span></div>
                    <div className="text-xs text-slate-500">自动计算</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left: Selection */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">工具与能力选择</h3>
                    <div className="space-y-3">
                      {tools.map(tool => {
                        const isSelected = activeSystem.selectedToolIds.includes(tool.id);
                        return (
                          <div key={tool.id} className={`border rounded-lg transition-all ${isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200'}`}>
                            <div className="flex items-center p-3 cursor-pointer" onClick={() => toggleTool(tool.id)}>
                              <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 accent-blue-600 mr-3" />
                              <span className="font-medium text-sm">{tool.name}</span>
                            </div>
                            
                            {isSelected && (
                              <div className="px-3 pb-3 pt-0 ml-7 flex flex-wrap gap-2 animate-fade-in">
                                {tool.defaultCapabilities.map(cap => {
                                  const isActive = (activeSystem.toolCapabilities[tool.id] || []).includes(cap);
                                  return (
                                    <button 
                                      key={cap}
                                      onClick={() => toggleToolCapability(tool.id, cap)}
                                      className={`text-xs px-2 py-1 rounded border transition-colors ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                                    >
                                      {CATEGORY_LABELS[cap]}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {tools.length === 0 && <div className="text-sm text-slate-400 italic">请先在“全局配置”中添加监控工具</div>}
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                         <span className="text-sm font-medium">服务覆盖范围</span>
                         <select className="text-sm border rounded px-2 py-1" value={activeSystem.serverCoverage} onChange={e => updateSystem({serverCoverage: e.target.value as any})}>
                           <option value="full">完全覆盖 (扣0分)</option>
                           <option value="basic">基本覆盖 (扣5分)</option>
                           <option value="partial">部分覆盖 (扣10分)</option>
                           <option value="low">低度覆盖 (扣15分)</option>
                         </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm mt-2">
                        <input type="checkbox" checked={activeSystem.isSelfBuilt} onChange={e => updateSystem({isSelfBuilt: e.target.checked})} className="accent-blue-600"/>
                        存在自建监控 (+5分)
                      </label>
                    </div>
                  </div>

                  {/* Right: Visualization & Result */}
                  <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                     <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide mb-4">覆盖度分析</h3>
                     
                     <div className="grid grid-cols-2 gap-3 mb-6">
                        {MANDATORY_CAPS.map(cap => {
                          const isCovered = !scores.missingCaps.includes(cap);
                          return (
                            <div key={cap} className={`flex items-center justify-between p-2 rounded text-sm ${isCovered ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                               <span>{CATEGORY_LABELS[cap]}</span>
                               {isCovered ? <span>✓</span> : <span>✕</span>}
                            </div>
                          );
                        })}
                     </div>

                     <div className="space-y-2 text-sm border-t border-slate-200 pt-4">
                        <div className="flex justify-between">
                          <span className="text-slate-500">套餐判定:</span>
                          <span className="font-medium capitalize">{scores.packageLevel === 'full' ? '完全覆盖' : scores.packageLevel === 'basic' ? '基本覆盖' : '覆盖不足'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">缺失组件扣分:</span>
                          <span className="text-red-600 font-medium">-{scores.missingCaps.length * 15}</span>
                        </div>
                     </div>
                  </div>
                </div>
              </Card>

              {/* 1.1.2 Standardization Checklist */}
              {activeSystem.selectedToolIds.length > 0 && (
                <Card className="p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-bold">1.1.2 工具指标标准化</h2>
                    <p className="text-sm text-slate-500">请核对以下指标是否已配置 (系统根据启用能力自动筛选)</p>
                  </div>
                  
                  <div className="space-y-6">
                    {activeSystem.selectedToolIds.map(tid => {
                      const tool = tools.find(t => t.id === tid);
                      if (!tool) return null;
                      
                      const enabledCaps = activeSystem.toolCapabilities[tid] || [];
                      const relevantScenarios = tool.scenarios.filter(s => enabledCaps.includes(s.category));
                      
                      if (relevantScenarios.length === 0) return null;
                      
                      const checkedCount = relevantScenarios.filter(s => activeSystem.checkedScenarioIds.includes(s.id)).length;
                      const pct = Math.round((checkedCount / relevantScenarios.length) * 100);
                      
                      return (
                        <div key={tid} className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className="bg-slate-50 px-4 py-3 flex justify-between items-center border-b border-slate-200">
                             <div className="font-semibold text-slate-700">{tool.name}</div>
                             <div className="text-xs font-medium px-2 py-1 rounded bg-white border border-slate-200">
                               完成率: {pct}%
                             </div>
                          </div>
                          <div className="divide-y divide-slate-100">
                             {relevantScenarios.map(scen => (
                               <label key={scen.id} className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                                 <input 
                                   type="checkbox" 
                                   checked={activeSystem.checkedScenarioIds.includes(scen.id)}
                                   onChange={() => toggleScenario(scen.id)}
                                   className="w-4 h-4 accent-blue-600 mr-4"
                                 />
                                 <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                       <span className="text-sm font-medium text-slate-800">{scen.metric}</span>
                                       <span className="text-xs text-slate-400">({scen.threshold})</span>
                                    </div>
                                 </div>
                                 <Badge color={scen.level === 'red' ? 'red' : scen.level === 'orange' ? 'yellow' : 'gray'}>
                                    {CATEGORY_LABELS[scen.category]}
                                 </Badge>
                               </label>
                             ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Other sections (Collapsed for brevity visually, but implemented) */}
              <Card className="p-6 opacity-80 hover:opacity-100 transition-opacity">
                 <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold text-slate-700">其他评分项 (1.2 - 1.4)</h2>
                    <span className="text-lg font-bold text-slate-600">{scores.part2 + scores.part3 + scores.part4} 分</span>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase">1.2 故障检测 (20分)</label>
                       <select className="w-full mt-1 border rounded p-2 text-sm" value={activeSystem.accuracy} onChange={e => updateSystem({accuracy: e.target.value as any})}>
                          <option value="perfect">准确率极高 (10)</option><option value="high">准确率高 (7)</option><option value="medium">准确率中 (3)</option><option value="low">准确率低 (0)</option>
                       </select>
                       <select className="w-full mt-2 border rounded p-2 text-sm" value={activeSystem.discoveryRate} onChange={e => updateSystem({discoveryRate: e.target.value as any})}>
                          <option value="perfect">发现率极高 (10)</option><option value="high">发现率高 (7)</option><option value="medium">发现率中 (3)</option><option value="low">发现率低 (0)</option>
                       </select>
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase">1.3 告警配置 (10分)</label>
                       <select className="w-full mt-1 border rounded p-2 text-sm" value={activeSystem.opsLeadConfigured} onChange={e => updateSystem({opsLeadConfigured: e.target.value as any})}>
                          <option value="full">负责人配置合规 (5)</option><option value="missing">不合规 (0)</option>
                       </select>
                       <select className="w-full mt-2 border rounded p-2 text-sm" value={activeSystem.dataMonitorConfigured} onChange={e => updateSystem({dataMonitorConfigured: e.target.value as any})}>
                          <option value="full">数据监控覆盖 (5)</option><option value="missing">有遗漏 (0)</option><option value="na">未接入 (-5)</option>
                       </select>
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase">1.4 团队能力 (10分)</label>
                       <div className="flex items-center justify-between mt-2 text-sm">
                          <span>超时响应:</span>
                          <input type="number" className="w-16 border rounded p-1 text-center" value={activeSystem.lateResponseCount} onChange={e => updateSystem({lateResponseCount: Number(e.target.value)})} />
                       </div>
                       <div className="flex items-center justify-between mt-2 text-sm">
                          <span>整改逾期:</span>
                          <input type="number" className="w-16 border rounded p-1 text-center" value={activeSystem.overdueCount} onChange={e => updateSystem({overdueCount: Number(e.target.value)})} />
                       </div>
                    </div>
                 </div>
              </Card>

            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
    