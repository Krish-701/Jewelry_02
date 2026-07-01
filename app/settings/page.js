'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/config')
            .then(res => res.json())
            .then(data => {
                setConfig(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    return (
        <div className="settings-page">
            <div className="settings-container">
                <div className="section-header" style={{ marginBottom: '2rem' }}>
                    <h2>⚙ <span className="gradient-text">Settings</span></h2>
                    <p>Configure your AI provider and API keys</p>
                </div>

                {loading ? (
                    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                        Loading configuration...
                    </div>
                ) : (
                    <>
                        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>📊 Current Status</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>LLM Provider</span>
                                    <p style={{ fontWeight: 600, color: 'var(--accent-gold-light)' }}>
                                        NeuralWatt ({config?.modelId || 'kimi-k2.6'})
                                    </p>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Image Provider</span>
                                    <p style={{ fontWeight: 600, color: 'var(--accent-gold-light)' }}>
                                        Freepik / Magnific ({config?.imageModel || 'nano-banana-pro-flash'})
                                    </p>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>NeuralWatt Key</span>
                                    <p style={{ fontWeight: 600 }}>
                                        {config?.hasNeuralwattKey ? (
                                            <span style={{ color: 'var(--accent-emerald)' }}>✓ Configured</span>
                                        ) : (
                                            <span style={{ color: 'var(--accent-rose)' }}>✕ Not Set</span>
                                        )}
                                    </p>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Freepik Key</span>
                                    <p style={{ fontWeight: 600 }}>
                                        {config?.hasFreepikKey ? (
                                            <span style={{ color: 'var(--accent-emerald)' }}>✓ Configured</span>
                                        ) : (
                                            <span style={{ color: 'var(--accent-rose)' }}>✕ Not Set</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>🔧 How to Configure</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.8 }}>
                                Edit the <code style={{
                                    background: 'rgba(212, 168, 83, 0.1)',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    color: 'var(--accent-gold-light)',
                                    fontSize: '0.85rem',
                                }}>.env</code> file in your project root:
                            </p>

                            <div style={{
                                background: 'var(--bg-primary)',
                                borderRadius: 'var(--radius-md)',
                                padding: '1.5rem',
                                marginTop: '1rem',
                                fontFamily: 'monospace',
                                fontSize: '0.85rem',
                                lineHeight: 1.8,
                                color: 'var(--text-secondary)',
                                overflowX: 'auto',
                            }}>
                                <div><span style={{ color: 'var(--text-muted)' }}># NeuralWatt LLM — analysis & prompts</span></div>
                                <div><span style={{ color: 'var(--accent-gold-light)' }}>NEURALWATT_API_KEY</span>=your-key-here</div>
                                <div><span style={{ color: 'var(--accent-gold-light)' }}>NEURALWATT_BASE_URL</span>=https://api.neuralwatt.com/v1</div>
                                <div><span style={{ color: 'var(--accent-gold-light)' }}>NEURALWATT_MODEL</span>=kimi-k2.6</div>
                                <br />
                                <div><span style={{ color: 'var(--text-muted)' }}># Freepik / Magnific API — image generation</span></div>
                                <div><span style={{ color: 'var(--accent-gold-light)' }}>FREEPIK_API_KEY</span>=your-key-here</div>
                                <div><span style={{ color: 'var(--accent-gold-light)' }}>FREEPIK_BASE_URL</span>=https://api.magnific.com</div>
                                <div><span style={{ color: 'var(--accent-gold-light)' }}>FREEPIK_IMAGE_MODEL</span>=nano-banana-pro-flash</div>
                                <div><span style={{ color: 'var(--accent-gold-light)' }}>PUBLIC_BASE_URL</span>=https://design.krish.in.net</div>
                            </div>
                        </div>

                        <div className="glass-card" style={{ padding: '1.5rem' }}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>🤖 API Stack</h3>
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                <div style={{
                                    padding: '1rem',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <h4 style={{ fontSize: '0.95rem' }}>NeuralWatt LLM</h4>
                                        <span className="analysis-tag">Analysis</span>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        <strong>Model:</strong> kimi-k2.6<br />
                                        Jewelry image analysis and prompt understanding via OpenAI-compatible API
                                    </p>
                                </div>
                                <div style={{
                                    padding: '1rem',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <h4 style={{ fontSize: '0.95rem' }}>Freepik / Magnific</h4>
                                        <span className="analysis-tag" style={{ background: 'rgba(52, 211, 153, 0.1)', color: 'var(--accent-emerald)', borderColor: 'rgba(52, 211, 153, 0.2)' }}>Generation</span>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        <strong>Model:</strong> Nano Banana 2 (nano-banana-pro-flash)<br />
                                        Fast Gemini 3.1 Flash generation with up to 14 reference images. Docs: <a href="https://docs.magnific.com/api-reference/text-to-image/nano-banana-pro-flash/overview" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold-light)' }}>docs.magnific.com</a>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}