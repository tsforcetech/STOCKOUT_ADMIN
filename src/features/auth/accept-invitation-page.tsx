import * as React from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ArrowSquareOutIcon, CheckCircleIcon, EnvelopeSimpleOpenIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import { userOrgErrorCode, userOrgErrorMessage } from "@/features/team/errors";
import { env } from "@/config/env";
import { AuthCard, AuthShell } from "./auth-shell";

/** What each accept error means for the person holding the link (PlatformInvitationsController.cs:124-160). */
const ACCEPT_ERRORS: Record<string, string> = {
  INVALID_INVITATION_TOKEN: "This invitation link isn't valid. Open the link from the email again, or ask an admin to resend the invitation.",
  INVITATION_NOT_FOUND: "This invitation no longer exists. Ask an admin to send you a new one.",
  INVITATION_ALREADY_ACCEPTED: "This invitation has already been accepted. Log in with the invited account to use the admin console.",
  INVITATION_REVOKED: "This invitation was withdrawn by an admin. Ask them to send you a new one if you still need access.",
  INVITATION_EXPIRED: "This invitation has expired. Ask an admin to resend it.",
  INVITATION_EMAIL_MISMATCH: "This invitation was sent to a different email address. Log out, then log in with the email the invitation was sent to.",
  EMAIL_NOT_VERIFIED: "Your email address isn't verified yet. Verify it from the email we sent when you created your account, then try again.",
  INVALID_EMAIL: "Your account has no email address, so the invitation can't be matched to it.",
  INVALID_USER: "Your session isn't valid any more. Log out and log in again.",
};

/**
 * Landing page for the link in the platform invitation email: /platform/invitation?token=…
 * Public route: invitees usually have no admin access yet. Accepting needs a signed-in account whose verified email
 * matches the invitation; on success the new roles are loaded and the console opens.
 */
export default function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const location = useLocation();
  const navigate = useNavigate();
  const { status, user, signOut, reloadAccess } = useAuth();
  const [done, setDone] = React.useState(false);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [errorText, setErrorText] = React.useState<string | null>(null);

  const accept = useApiMutation({
    mutationFn: () => platformService.acceptInvitation(token),
    toastOnError: false,
    onSuccess: async () => {
      await reloadAccess().catch(() => undefined);
      setDone(true);
    },
  });

  const run = () => {
    setErrorCode(null);
    setErrorText(null);
    accept.mutate(undefined, {
      onError: (e) => {
        const code = userOrgErrorCode(e) ?? null;
        setErrorCode(code);
        setErrorText((code && ACCEPT_ERRORS[code]) || userOrgErrorMessage(e));
      },
    });
  };

  const here = location.pathname + location.search;
  const loginHref = `/login?next=${encodeURIComponent(here)}`;
  const switchAccount = async () => {
    await signOut();
    navigate(loginHref);
  };

  let body: React.ReactNode;
  if (!token) {
    body = (
      <Message tone="danger" title="This link is incomplete">
        The invitation token is missing. Open the link from the invitation email again — copy the whole address if your email app split it.
      </Message>
    );
  } else if (status === "initializing") {
    body = <p className="text-center text-sm text-muted-foreground">Checking your session…</p>;
  } else if (done) {
    body = (
      <div className="space-y-6 text-center">
        <CheckCircleIcon className="mx-auto size-14 text-success" weight="fill" aria-hidden />
        <div>
          <p className="font-heading text-xl font-bold text-foreground">You're in</p>
          <p className="mt-1 text-sm text-muted-foreground">The invitation is accepted and your admin access is ready.</p>
        </div>
        <Button size="lg" className="w-full" onClick={() => navigate("/", { replace: true })}>
          Open the admin console
        </Button>
      </div>
    );
  } else if (status !== "authenticated") {
    body = (
      <div className="space-y-6">
        <p className="text-center text-sm leading-6 text-body">
          Log in with the email address this invitation was sent to. You'll come straight back here to accept it.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link to={loginHref}>Log in to accept</Link>
        </Button>
        <div className="rounded-lg bg-surface-muted p-4 text-sm leading-6 text-body">
          <p className="font-medium text-foreground">No StockOut account yet?</p>
          <p className="mt-1">
            Create one on the marketplace with the <strong>same email address</strong>, verify your email, then open the invitation link again.
          </p>
          <a href={`${env.marketplaceUrl}/register`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4">
            Create an account <ArrowSquareOutIcon className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
    );
  } else {
    const unverified = user?.emailVerified === false;
    body = (
      <div className="space-y-6">
        <div className="rounded-lg border border-border px-4 py-3 text-sm">
          <p className="text-muted-foreground">Signed in as</p>
          <p className="truncate font-medium text-foreground">{user?.email || user?.displayName || "your account"}</p>
        </div>
        {unverified && !errorText && (
          <Message tone="warning" title="Verify your email first">
            {ACCEPT_ERRORS.EMAIL_NOT_VERIFIED}
          </Message>
        )}
        {errorText && (
          <Message tone="danger" title="The invitation couldn't be accepted">
            {errorText}
          </Message>
        )}
        <Button size="lg" className="w-full" loading={accept.isPending} disabled={errorCode === "INVITATION_ALREADY_ACCEPTED"} onClick={run}>
          Accept invitation
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Not the invited account?{" "}
          <button type="button" onClick={() => void switchAccount()} className="cursor-pointer font-medium text-foreground underline underline-offset-4">
            Log in with a different email
          </button>
        </p>
      </div>
    );
  }

  return (
    <AuthShell>
      <AuthCard title="You're invited" subtitle="Join the StockOut admin console">
        <div className="mx-auto w-full max-w-[440px]">
          <EnvelopeSimpleOpenIcon className="mx-auto mb-6 size-10 text-foreground" aria-hidden />
          {body}
        </div>
      </AuthCard>
    </AuthShell>
  );
}

function Message({ tone, title, children }: { tone: "danger" | "warning"; title: string; children: React.ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={tone === "danger" ? "rounded-lg bg-danger-soft p-4 text-sm text-danger-soft-foreground" : "rounded-lg bg-warning-soft p-4 text-sm text-warning-soft-foreground"}>
      <p className="flex items-center gap-1.5 font-medium">
        <WarningCircleIcon className="size-4 shrink-0" aria-hidden /> {title}
      </p>
      <p className="mt-1 leading-6">{children}</p>
    </div>
  );
}
