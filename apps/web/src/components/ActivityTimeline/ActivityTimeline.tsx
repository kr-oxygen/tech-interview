import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import EditIcon from '@mui/icons-material/Edit';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ActivityEventDto } from '@ti/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatTime } from '../../lib/format';
import { useUiStore, type TimelineFilter } from '../../stores/uiStore';
import { describeEvent, type EventView } from './describeEvent';

const ICONS: Record<string, React.ReactNode> = {
  COPY: <ContentCopyIcon fontSize="inherit" />,
  CUT: <ContentCutIcon fontSize="inherit" />,
  PASTE: <ContentPasteIcon fontSize="inherit" />,
  SELECTION: <HighlightAltIcon fontSize="inherit" />,
  editing: <EditIcon fontSize="inherit" />,
  focus: <VisibilityOutlinedIcon fontSize="inherit" />,
  session: <InfoOutlinedIcon fontSize="inherit" />,
};

const FILTER_LABELS: Record<TimelineFilter, string> = {
  editing: 'Edits',
  clipboard: 'Clipboard',
  selection: 'Selection',
  focus: 'Focus & tabs',
  session: 'Session',
};

interface Props {
  events: ActivityEventDto[];
  selectedSeq: number | null;
  /** Sequence numbers referenced by observations, shown with a marker. */
  flaggedSeq: Set<number>;
  onSelect: (e: ActivityEventDto, view: EventView) => void;
}

/** Pixels from the top within which the list counts as "showing the newest events". */
const AT_TOP_PX = 24;

/**
 * Filterable, keyboard-navigable activity list (virtualised), newest first.
 * At the top it shows new events as they arrive; scrolled down, it keeps the position
 * and offers a "new events" button instead.
 */
export function ActivityTimeline({ events, selectedSeq, flaggedSeq, onSelect }: Props) {
  const { timelineFilters, setTimelineFilters } = useUiStore();
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const allowed = new Set(timelineFilters);
    return events
      .map((e) => ({ e, v: describeEvent(e) }))
      .filter(({ v }) => allowed.has(v.category))
      .reverse();
  }, [events, timelineFilters]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  const selectedIndex = rows.findIndex((r) => r.e.sequenceNumber === selectedSeq);

  // Keep the reading position when new events are prepended while scrolled down.
  const headSeq = rows[0]?.e.sequenceNumber ?? null;
  const prev = useRef<{ headSeq: number | null; total: number }>({ headSeq: null, total: 0 });
  const [unseen, setUnseen] = useState(0);
  const total = virtualizer.getTotalSize();
  useLayoutEffect(() => {
    const el = parentRef.current;
    const before = prev.current;
    prev.current = { headSeq, total };
    if (!el || before.headSeq === null || headSeq === null || headSeq === before.headSeq) return;
    if (el.scrollTop > AT_TOP_PX) {
      el.scrollTop += total - before.total;
      setUnseen((n) => n + rows.findIndex((r) => r.e.sequenceNumber === before.headSeq));
    }
  }, [headSeq, total, rows]);

  const onScroll = () => {
    if ((parentRef.current?.scrollTop ?? 0) <= AT_TOP_PX) setUnseen(0);
  };
  const scrollToNewest = () => {
    parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setUnseen(0);
  };

  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex, virtualizer]);

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    const next = Math.min(rows.length - 1, Math.max(0, (selectedIndex < 0 ? rows.length : selectedIndex) + (ev.key === 'ArrowDown' ? 1 : -1)));
    if (rows[next]) onSelect(rows[next].e, rows[next].v);
  };

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <ToggleButtonGroup
        size="small"
        value={timelineFilters}
        onChange={(_, v: TimelineFilter[]) => setTimelineFilters(v)}
        sx={{ flexWrap: 'wrap', px: 1, pb: 1 }}
        aria-label="Event filters"
      >
        {(Object.keys(FILTER_LABELS) as TimelineFilter[]).map((f) => (
          <ToggleButton key={f} value={f} sx={{ textTransform: 'none', py: 0.25 }}>
            {FILTER_LABELS[f]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {unseen > 0 && (
        <Box sx={{ position: 'relative', height: 0, zIndex: 1, display: 'flex', justifyContent: 'center' }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<ArrowUpwardIcon />}
            onClick={scrollToNewest}
            sx={{ position: 'absolute', top: 6, borderRadius: 4, textTransform: 'none', py: 0.25 }}
          >
            {unseen} new {unseen === 1 ? 'event' : 'events'}
          </Button>
        </Box>
      )}
      <Box
        ref={parentRef}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        role="listbox"
        aria-label="Activity timeline, newest first (use arrow keys to navigate)"
        sx={{ flex: 1, minHeight: 200, overflow: 'auto', outline: 'none', '&:focus-visible': { boxShadow: (t) => `inset 0 0 0 2px ${t.palette.primary.main}` } }}
      >
        {rows.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No events yet.
          </Typography>
        )}
        <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const { e, v } = rows[item.index];
            const selected = e.sequenceNumber === selectedSeq;
            return (
              <Box
                key={e.sequenceNumber}
                data-index={item.index}
                ref={virtualizer.measureElement}
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(e, v)}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${item.start}px)`,
                  px: 1.5,
                  py: 0.75,
                  cursor: 'pointer',
                  borderBottom: 1,
                  borderColor: 'divider',
                  bgcolor: selected ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 58 }}>
                    {formatTime(e.timestamp)}
                  </Typography>
                  <Box sx={{ fontSize: 16, display: 'flex', color: v.emphasis ? 'warning.main' : 'text.secondary' }}>
                    {ICONS[e.eventType] ?? ICONS[v.category]}
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: v.emphasis ? 600 : 400 }} noWrap>
                    {v.title}
                  </Typography>
                  {flaggedSeq.has(e.sequenceNumber) && <Chip size="small" color="warning" label="observation" sx={{ height: 18 }} />}
                </Stack>
                {v.summary && (
                  <Typography variant="caption" color="text.secondary" sx={{ pl: '74px', display: 'block' }} noWrap>
                    {v.summary}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Stack>
  );
}
