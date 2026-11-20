import React, { useState } from "react";
import { api } from "../data";

// Opened from the link in a recovery mail (/reset-password#token=…). The token is read before the app
// rewrites the address, so it never stays in the address bar or in history.
export default function ResetPasswordScreen({
  token,
  onDone,
  onCancel,
}: {
  token: string | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ username: string; recoveryCode: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setDone(
        await api<{ username: string; recoveryCode: string }>("/auth/email-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, newPassword: password }),
        }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "비밀번호를 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="auth-content recovery-content">
        <h1>새 계정 복구 코드</h1>
        <p>
          <b>{done.username}</b> 계정의 비밀번호를 바꿨고, 다른 기기에서는 모두 로그아웃됐어요. 복구 코드도 새로 만들었으니 안전한 곳에
          보관해 주세요. 다시 표시되지 않습니다.
        </p>
        <code>{done.recoveryCode}</code>
        <button
          className="solid-button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onDone();
          }}
        >
          보관했어요 · 시작하기
        </button>
      </div>
    );

  if (!token)
    return (
      <div className="auth-content">
        <div className="auth-top" />
        <h1>링크 확인</h1>
        <p className="auth-hint">
          링크가 올바르지 않아요. 메일의 링크를 다시 열거나, 로그인 화면의 "이메일로 찾기"에서 새로 요청해 주세요.
        </p>
        <div className="auth-form">
          <button className="solid-button" onClick={onCancel}>
            로그인 화면으로
          </button>
        </div>
      </div>
    );

  return (
    <div className="auth-content">
      <div className="auth-top" />
      <h1>새 비밀번호</h1>
      <p className="auth-hint">메일로 받은 링크는 30분 동안 한 번만 쓸 수 있어요.</p>
      <form className="auth-form" onSubmit={submit}>
        <input
          aria-label="새 비밀번호"
          type="password"
          placeholder="새 비밀번호 (8자 이상)"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          value={password}
          onChange={event => setPassword(event.target.value)}
        />
        <button className="solid-button" disabled={busy}>
          {busy ? "처리 중..." : "비밀번호 바꾸기"}
        </button>
      </form>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="demo-link" onClick={onCancel}>
        로그인 화면으로
      </button>
    </div>
  );
}
