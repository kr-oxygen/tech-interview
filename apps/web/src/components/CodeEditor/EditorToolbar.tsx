import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import { IconButton, MenuItem, Select, Stack, Switch, Tooltip, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useUiStore, type EditorTheme } from '../../stores/uiStore';

interface Props {
  onFormat?: () => void;
  children?: ReactNode;
}

/** Editor preferences: theme, font size, minimap, optional "format document". */
export function EditorToolbar({ onFormat, children }: Props) {
  const { editorTheme, fontSize, minimap, setEditorTheme, setFontSize, setMinimap } = useUiStore();
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5, flexWrap: 'wrap' }}>
      {children}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 'auto' }}>
        {onFormat && (
          <Tooltip title="Format document (Shift+Alt+F)">
            <IconButton size="small" onClick={onFormat} aria-label="Format document">
              <FormatAlignLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Select
          size="small"
          value={editorTheme}
          onChange={(e) => setEditorTheme(e.target.value as EditorTheme)}
          aria-label="Editor theme"
          sx={{ fontSize: 13 }}
        >
          <MenuItem value="vs">Light</MenuItem>
          <MenuItem value="vs-dark">Dark</MenuItem>
          <MenuItem value="hc-black">High contrast</MenuItem>
        </Select>
        <Select
          size="small"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          aria-label="Font size"
          sx={{ fontSize: 13 }}
        >
          {[12, 13, 14, 16, 18, 20].map((n) => (
            <MenuItem key={n} value={n}>
              {n}px
            </MenuItem>
          ))}
        </Select>
        <Typography variant="caption">Minimap</Typography>
        <Switch size="small" checked={minimap} onChange={(e) => setMinimap(e.target.checked)} />
      </Stack>
    </Stack>
  );
}
