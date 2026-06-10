"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Shield,
  Lock,
  Unlock,
  Loader2,
  Clock,
  Users,
  Trash2,
  Key,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";

export default function SecurityPage() {
  const {
    status,
    loading,
    sessions,
    checkAuth,
    setPassword,
    removePassword,
    toggleAuth,
    setSessionTimeout,
    fetchSessions,
    clearSessions,
  } = useAuthStore();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [timeoutHours, setTimeoutHours] = useState("");
  const [timeoutInitialized, setTimeoutInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchSessions();
  }, [checkAuth, fetchSessions]);

  if (!timeoutInitialized && status?.sessionTimeoutHours && timeoutHours === "") {
    setTimeoutHours(String(status.sessionTimeoutHours));
    setTimeoutInitialized(true);
  }

  const handleSetPassword = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!newPassword.trim()) {
      toast.error("Password cannot be empty");
      return;
    }
    if (newPassword.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await setPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password set successfully. Dashboard auth is now enabled.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to set password");
    }
    setSaving(false);
  };

  const handleRemovePassword = async () => {
    setSaving(true);
    try {
      await removePassword();
      toast.success("Password removed. Dashboard auth is now disabled.");
    } catch {
      toast.error("Failed to remove password");
    }
    setSaving(false);
  };

  const handleToggle = async (enabled: boolean) => {
    try {
      await toggleAuth(enabled);
      toast.success(enabled ? "Dashboard auth enabled" : "Dashboard auth disabled");
    } catch {
      toast.error("Failed to toggle auth");
    }
  };

  const handleSetTimeout = async () => {
    const hours = parseInt(timeoutHours);
    if (isNaN(hours) || hours < 1) {
      toast.error("Timeout must be at least 1 hour");
      return;
    }
    try {
      await setSessionTimeout(hours);
      toast.success(`Session timeout set to ${hours} hours`);
    } catch {
      toast.error("Failed to set timeout");
    }
  };

  const handleClearSessions = async () => {
    try {
      await clearSessions();
      toast.success("All sessions cleared");
    } catch {
      toast.error("Failed to clear sessions");
    }
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        subtitle="Manage dashboard authentication for public access"
      />

      {/* Status Overview */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Dashboard Authentication</CardTitle>
                  <CardDescription>
                    Protect your dashboard when accessed via public tunnel
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant={status?.authEnabled ? "default" : "outline"}
                className={status?.authEnabled ? "bg-green-600" : ""}
              >
                {status?.authEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Enable Authentication</p>
                <p className="text-xs text-muted-foreground">
                  When enabled, public access requires password login.
                  Localhost access is always allowed without auth.
                </p>
              </div>
              <Switch
                checked={status?.authEnabled ?? false}
                onCheckedChange={handleToggle}
                disabled={!status?.hasPassword}
              />
            </div>
            {!status?.hasPassword && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                Set a password below to enable authentication.
              </p>
            )}
            {status?.isLocal && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  <strong>You are accessing from localhost</strong> — auth is
                  bypassed for local connections regardless of settings.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Set Password */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5 text-orange-500" />
              <div>
                <CardTitle>
                  {status?.hasPassword ? "Change Password" : "Set Password"}
                </CardTitle>
                <CardDescription>
                  {status?.hasPassword
                    ? "Update your dashboard login password"
                    : "Set a password to enable dashboard authentication"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSetPassword}>
            <div className="space-y-2">
              <Label htmlFor="new-password">
                {status?.hasPassword ? "New Password" : "Password"}
              </Label>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter password (min 4 characters)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                {status?.hasPassword ? "Update Password" : "Set Password"}
              </Button>
              {status?.hasPassword && (
                <Dialog>
                  <DialogTrigger render={<Button variant="destructive" disabled={saving} />}>
                    <Unlock className="mr-2 h-4 w-4" />
                    Remove Password
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Remove Password?</DialogTitle>
                      <DialogDescription>
                        This will disable dashboard authentication. Anyone with
                        access to the URL will be able to view and control your
                        proxy.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                      <Button
                        variant="destructive"
                        onClick={handleRemovePassword}
                      >
                        Remove Password
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Session Settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-blue-500" />
              <div>
                <CardTitle>Session Settings</CardTitle>
                <CardDescription>
                  Configure how long login sessions remain valid
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="timeout">Session Timeout (hours)</Label>
                <Input
                  id="timeout"
                  name="sessionTimeoutHours"
                  type="number"
                  min="1"
                  max="720"
                  value={timeoutHours}
                  onChange={(e) => setTimeoutHours(e.target.value)}
                  placeholder="24"
                />
              </div>
              <Button onClick={handleSetTimeout} variant="outline">
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              After this period, users will need to log in again. Range: 1–720
              hours (30 days).
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Active Sessions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-green-500" />
                <div>
                  <CardTitle>Active Sessions</CardTitle>
                  <CardDescription>
                    {sessions.length} active session(s)
                  </CardDescription>
                </div>
              </div>
              {sessions.length > 0 && (
                <Dialog>
                  <DialogTrigger render={<Button variant="destructive" size="sm" />}>
                    <Trash2 className="mr-2 h-3 w-3" />
                    Clear All
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Clear All Sessions?</DialogTitle>
                      <DialogDescription>
                        This will log out all users (including yourself if
                        accessing remotely). You will need to log in again.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                      <Button
                        variant="destructive"
                        onClick={handleClearSessions}
                      >
                        Clear All Sessions
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active sessions.
              </p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div className="space-y-0.5">
                      <p className="font-mono text-xs">{s.id}</p>
                      <p className="text-xs text-muted-foreground">
                        IP: {s.ip} • {s.userAgent.slice(0, 50)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>
                        Created:{" "}
                        {new Date(s.createdAt).toLocaleString()}
                      </p>
                      <p>
                        Expires:{" "}
                        {new Date(s.expiresAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
