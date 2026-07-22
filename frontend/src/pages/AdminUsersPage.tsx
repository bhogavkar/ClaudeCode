import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import GlassCard from '@/components/GlassCard';
import api from '@/services/api';
import { ROLE_COLORS } from '@/utils/constants';
import type { User } from '@/types';

interface UserRow extends User {
  isActive: boolean;
  lastLoginAt: string | null;
}

/** Admin-only: paginated list of platform users. */
export default function AdminUsersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () =>
      api.get<{ users: UserRow[]; total: number }>('/users', { params: { pageSize: 100 } }).then((r) => r.data),
  });

  return (
    <Stack spacing={3}>
      <Typography variant="h4">User management</Typography>
      <GlassCard sx={{ p: 0, overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last login</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5}>Loading…</TableCell>
              </TableRow>
            )}
            {data?.users.map((u) => (
              <TableRow key={u.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar src={u.avatarUrl ?? undefined} sx={{ width: 32, height: 32 }}>
                      {u.name[0]}
                    </Avatar>
                    <span>{u.name}</span>
                  </Stack>
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Chip size="small" label={u.role} sx={{ bgcolor: ROLE_COLORS[u.role], color: '#fff' }} />
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={u.isActive ? 'success' : 'default'}
                    label={u.isActive ? 'Active' : 'Disabled'}
                  />
                </TableCell>
                <TableCell>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </GlassCard>
    </Stack>
  );
}
