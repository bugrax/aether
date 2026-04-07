import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { graphAPI } from '../api';
import { trackScreenView } from '../analytics';

export default function GraphPage() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [hoverNode, setHoverNode] = useState(null);
  const [filterLabel, setFilterLabel] = useState('');
  const [mode, setMode] = useState('similarity'); // 'similarity' or 'entities'
  const fgRef = useRef();
  const ForceGraph = useRef(null);
  const [graphReady, setGraphReady] = useState(false);

  useEffect(() => { trackScreenView('Graph'); }, []);

  // Dynamic import for react-force-graph-2d (heavy library)
  useEffect(() => {
    import('react-force-graph-2d').then(mod => {
      ForceGraph.current = mod.default;
      setGraphReady(true);
    });
  }, []);

  useEffect(() => {
    loadGraph();
  }, [mode]);

  async function loadGraph() {
    setLoading(true);
    try {
      const data = mode === 'entities' ? await graphAPI.entities() : await graphAPI.get();
      setGraphData({
        nodes: data.nodes || [],
        links: data.links || [],
      });
    } catch (err) {
      console.error('Graph load failed:', err);
    } finally {
      setLoading(false);
    }
  }

  // Get unique labels for filter
  const labels = [...new Set(graphData.nodes.map(n => n.label))].sort();

  // Filter nodes/links
  const filteredData = filterLabel ? {
    nodes: graphData.nodes.filter(n => n.label === filterLabel),
    links: graphData.links.filter(l => {
      const nodeIds = new Set(graphData.nodes.filter(n => n.label === filterLabel).map(n => n.id));
      return nodeIds.has(l.source?.id || l.source) && nodeIds.has(l.target?.id || l.target);
    }),
  } : graphData;

  const handleNodeClick = useCallback((node) => {
    if (node.node_type === 'entity') {
      // entity:uuid → extract uuid
      const entityId = node.id.replace('entity:', '');
      navigate(`/entities/${entityId}`);
    } else {
      navigate(`/vault/${node.id}`);
    }
  }, [navigate]);

  if (loading || !graphReady) {
    return (
      <div className="chat-page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  const Graph = ForceGraph.current;

  return (
    <div className="chat-page-container" style={{ position: 'relative' }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: 'rgba(14,14,14,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--outline-variant)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/vault')} style={{
            background: 'none', border: 'none', color: 'var(--on-surface-variant)', cursor: 'pointer', fontSize: '0.8rem',
          }}>←</button>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--on-surface)', fontSize: '0.875rem' }}>
            {lang === 'tr' ? 'Bilgi Haritasi' : 'Graph'}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--outline)' }}>
            {filteredData.nodes.length}/{filteredData.links.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Mode toggle */}
          <div style={{
            display: 'flex', borderRadius: 'var(--radius-full)',
            border: '1px solid var(--outline-variant)', overflow: 'hidden',
          }}>
            <button
              onClick={() => setMode('similarity')}
              style={{
                padding: '4px 10px', fontSize: '0.65rem', border: 'none', cursor: 'pointer',
                background: mode === 'similarity' ? 'var(--primary)' : 'var(--surface-container)',
                color: mode === 'similarity' ? '#fff' : 'var(--on-surface-variant)',
              }}
            >
              {lang === 'tr' ? 'Benzerlik' : 'Similarity'}
            </button>
            <button
              onClick={() => setMode('entities')}
              style={{
                padding: '4px 10px', fontSize: '0.65rem', border: 'none', cursor: 'pointer',
                background: mode === 'entities' ? 'var(--primary)' : 'var(--surface-container)',
                color: mode === 'entities' ? '#fff' : 'var(--on-surface-variant)',
              }}
            >
              {lang === 'tr' ? 'Varliklar' : 'Entities'}
            </button>
          </div>
          <select
            value={filterLabel}
            onChange={e => setFilterLabel(e.target.value)}
            style={{
              background: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-full)', color: 'var(--on-surface)',
              padding: '4px 10px', fontSize: '0.7rem', outline: 'none',
            }}
          >
            <option value="">{lang === 'tr' ? 'Tumu' : 'All'}</option>
            {labels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoverNode && (
        <div style={{
          position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
          background: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-md)', padding: '8px 16px',
          fontSize: '0.8125rem', color: 'var(--on-surface)', maxWidth: 300, textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <strong>{hoverNode.title}</strong>
          <div style={{ fontSize: '0.7rem', color: hoverNode.color, marginTop: 2 }}>
            {hoverNode.node_type === 'entity' ? `Entity: ${hoverNode.label}` : hoverNode.label}
          </div>
        </div>
      )}

      {/* Graph */}
      {Graph && (
        <Graph
          ref={fgRef}
          graphData={filteredData}
          backgroundColor="#0e0e0e"
          nodeColor={node => node.color || '#9093ff'}
          nodeVal={node => node.size || 3}
          nodeLabel=""
          linkColor={() => 'rgba(183,159,255,0.15)'}
          linkWidth={link => Math.max(0.5, (link.score || 0.3) * 2)}
          onNodeClick={handleNodeClick}
          onNodeHover={node => setHoverNode(node || null)}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const r = Math.sqrt(node.size || 3) * 2;
            const isEntity = node.node_type === 'entity';

            if (isEntity) {
              // Diamond shape for entities
              ctx.beginPath();
              ctx.moveTo(node.x, node.y - r * 1.3);
              ctx.lineTo(node.x + r * 1.3, node.y);
              ctx.lineTo(node.x, node.y + r * 1.3);
              ctx.lineTo(node.x - r * 1.3, node.y);
              ctx.closePath();
              ctx.fillStyle = node.color || '#9093ff';
              ctx.fill();
              ctx.strokeStyle = 'rgba(255,255,255,0.3)';
              ctx.lineWidth = 0.5;
              ctx.stroke();
            } else {
              // Circle for notes
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = node.color || '#9093ff';
              ctx.fill();
            }

            // Glow
            ctx.shadowColor = node.color || '#9093ff';
            ctx.shadowBlur = isEntity ? 12 : 8;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Label if zoomed in
            if (globalScale > 1.5) {
              ctx.font = `${isEntity ? 'bold ' : ''}${10 / globalScale}px JetBrains Mono, monospace`;
              ctx.fillStyle = 'rgba(255,255,255,0.8)';
              ctx.textAlign = 'center';
              ctx.fillText((node.title || '').substring(0, 25), node.x, node.y + r + 8 / globalScale);
            }
          }}
          width={typeof window !== 'undefined' ? (window.innerWidth > 768 ? window.innerWidth - 280 : window.innerWidth) : 800}
          height={typeof window !== 'undefined' ? (window.innerWidth > 768 ? window.innerHeight : window.innerHeight - 140) : 600}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      )}
    </div>
  );
}
