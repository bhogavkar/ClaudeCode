import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type ThemeMode = 'light' | 'dark';

interface UiState {
  themeMode: ThemeMode;
  toast: { message: string; severity: 'success' | 'error' | 'info' | 'warning' } | null;
}

function initialTheme(): ThemeMode {
  const stored = localStorage.getItem('pp_theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const initialState: UiState = {
  themeMode: initialTheme(),
  toast: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleTheme(state) {
      state.themeMode = state.themeMode === 'light' ? 'dark' : 'light';
      localStorage.setItem('pp_theme', state.themeMode);
    },
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
      localStorage.setItem('pp_theme', action.payload);
    },
    showToast(state, action: PayloadAction<NonNullable<UiState['toast']>>) {
      state.toast = action.payload;
    },
    hideToast(state) {
      state.toast = null;
    },
  },
});

export const { toggleTheme, setTheme, showToast, hideToast } = uiSlice.actions;
export default uiSlice.reducer;
