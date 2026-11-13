import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  colorSchemes: { light: true, dark: true },
  shape: { borderRadius: 8 },
  typography: { fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Range highlight in the read-only monitor editor.
        '.ti-highlight': { backgroundColor: 'rgba(255, 193, 7, 0.35)', borderRadius: 2 },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});
