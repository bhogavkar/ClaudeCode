import { Alert, Snackbar } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { hideToast } from '@/store/slices/uiSlice';

/** Global snackbar driven by the ui slice. */
export default function Toast() {
  const toast = useAppSelector((s) => s.ui.toast);
  const dispatch = useAppDispatch();

  return (
    <Snackbar
      open={Boolean(toast)}
      autoHideDuration={4000}
      onClose={() => dispatch(hideToast())}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {toast ? (
        <Alert severity={toast.severity} variant="filled" onClose={() => dispatch(hideToast())}>
          {toast.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}
