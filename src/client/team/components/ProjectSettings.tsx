import { useState, useEffect } from 'react';
import type { Project } from '../types';

interface ProjectSettingsProps {
  project: Project;
  onUpdate: (changes: Partial<Project>) => Promise<void>;
}

export default function ProjectSettings({ project, onUpdate }: ProjectSettingsProps): JSX.Element {
  const [techStack, setTechStack] = useState('');
  const [instructions, setInstructions] = useState('');
  const [contextFiles, setContextFiles] = useState('');
  const [tags, setTags] = useState('');
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTechStack(project.techStack?.join(', ') ?? '');
    setInstructions(project.instructions ?? '');
    setContextFiles(project.contextFiles?.join(', ') ?? '');
    setTags(project.tags?.join(', ') ?? '');
    setLinks(project.links?.length ? project.links.map((l) => ({ ...l })) : []);
  }, [project]);

  const parseCommaSeparated = (value: string): string[] =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const addLink = () => {
    setLinks((prev) => [...prev, { label: '', url: '' }]);
  };

  const removeLink = (index: number) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLink = (index: number, field: 'label' | 'url', value: string) => {
    setLinks((prev) =>
      prev.map((link, i) => (i === index ? { ...link, [field]: value } : link)),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onUpdate({
        techStack: parseCommaSeparated(techStack),
        instructions: instructions.trim(),
        contextFiles: parseCommaSeparated(contextFiles),
        tags: parseCommaSeparated(tags),
        links: links.filter((l) => l.label.trim() || l.url.trim()),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ab-settings">
      {/* Read-only info */}
      <div className="ab-settings-info">
        <div className="ab-settings-info-row">
          <span className="ab-settings-info-label">Repository</span>
          <span className="ab-settings-info-value">{project.repoPath || 'Not set'}</span>
        </div>
        <div className="ab-settings-info-row">
          <span className="ab-settings-info-label">Default Branch</span>
          <span className="ab-settings-info-value">{project.defaultBranch || 'main'}</span>
        </div>
      </div>

      {/* Editable fields */}
      <div className="ab-settings-form">
        <label className="ab-settings-label">
          Tech Stack
          <input
            className="ab-settings-input"
            value={techStack}
            onChange={(e) => setTechStack(e.target.value)}
            placeholder="e.g. React, TypeScript, Node.js"
          />
          <span className="ab-settings-hint">Comma-separated list</span>
        </label>

        <label className="ab-settings-label">
          Instructions
          <textarea
            className="ab-settings-textarea"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Project-level instructions for agents..."
            rows={5}
          />
        </label>

        <label className="ab-settings-label">
          Context Files
          <input
            className="ab-settings-input"
            value={contextFiles}
            onChange={(e) => setContextFiles(e.target.value)}
            placeholder="e.g. src/types.ts, README.md"
          />
          <span className="ab-settings-hint">Comma-separated file paths</span>
        </label>

        <label className="ab-settings-label">
          Tags
          <input
            className="ab-settings-input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. frontend, api, urgent"
          />
          <span className="ab-settings-hint">Comma-separated tags</span>
        </label>

        <div className="ab-settings-label">
          Links
          <div className="ab-settings-links">
            {links.map((link, i) => (
              <div key={i} className="ab-settings-link-row">
                <input
                  className="ab-settings-input ab-settings-link-label"
                  value={link.label}
                  onChange={(e) => updateLink(i, 'label', e.target.value)}
                  placeholder="Label"
                />
                <input
                  className="ab-settings-input ab-settings-link-url"
                  value={link.url}
                  onChange={(e) => updateLink(i, 'url', e.target.value)}
                  placeholder="https://..."
                />
                <button
                  type="button"
                  className="ab-settings-link-remove"
                  onClick={() => removeLink(i)}
                  title="Remove link"
                >
                  &times;
                </button>
              </div>
            ))}
            <button type="button" className="ab-settings-link-add" onClick={addLink}>
              + Add Link
            </button>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="ab-settings-footer">
        <button
          className="ab-settings-save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
