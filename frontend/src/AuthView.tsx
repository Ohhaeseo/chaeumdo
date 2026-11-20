import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "./data";

export type Account = { username: string; displayName: string; email?: string | null };
export type AuthScreen = "login" | "register" | "recover-id" | "reset" | "email-recovery" | "recovery-code";
export type LegalDocName = "privacy" | "terms";

type FormScreen = Exclude<AuthScreen, "recovery-code">;
const titles: Record<FormScreen, string> = {
  login: "LOGIN",
  register: "회원가입",
  "recover-id": "아이디 찾기",
  reset: "비밀번호 찾기",
  "email-recovery": "이메일로 찾기",
};
const submitLabels: Record<FormScreen, string> = {
  login: "로그인",
  register: "회원가입",
  "recover-id": "아이디 찾기",
  reset: "비밀번호 변경",
  "email-recovery": "안내 메일 받기",
};
const hints: Partial<Record<FormScreen, string>> = {
  register: "여행 기록을 계정에 연결하세요.",
  "recover-id": "회원가입 때 받은 복구 코드를 입력해 주세요.",
  reset: "회원가입 때 받은 복구 코드를 입력해 주세요.",
  "email-recovery": "계정에 등록한 이메일로 아이디와 비밀번호 재설정 링크를 보내 드려요.",
};

function post<T>(path: string, body: unknown) {
  return api<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function LegalLinks({ onLegal }: { onLegal: (doc: LegalDocName) => void }) {
  return <p className="legal-links">
    <button type="button" onClick={() => onLegal("terms")}>이용약관</button>
    <button type="button" onClick={() => onLegal("privacy")}>개인정보처리방침</button>
  </p>;
}

export default function AuthView({ screen, setScreen, loading, onDemo, onAuthenticated, onLegal, recoveryCode, setRecoveryCode }: {
  screen: AuthScreen;
  setScreen: (screen: AuthScreen) => void;
  loading: boolean;
  onDemo: () => void;
  onAuthenticated: (account: Account) => Promise<void>;
  onLegal: (doc: LegalDocName) => void;
  recoveryCode: string;
  setRecoveryCode: (code: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<React.ReactNode>(null);
  // Registration already set the session cookie, so this account is signed in once its recovery code is saved.
  const [registered, setRegistered] = useState<Account | null>(null);
  // The ID and email are worth carrying between screens; a typed password, the last screen's error and result are not.
  const [shownScreen, setShownScreen] = useState(screen);
  if (shownScreen !== screen) {
    setShownScreen(screen);
    setPassword("");
    setError("");
    setResult(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (screen === "register") {
        const result = await post<Account & { recoveryCode: string }>("/auth/register", { username, displayName, password, email: email.trim() || null, agreedToTerms: agreed });
        setRegistered({ username: result.username, displayName: result.displayName, email: email.trim() || null });
        setRecoveryCode(result.recoveryCode);
        setScreen("recovery-code");
      }
      if (screen === "login") await onAuthenticated(await post<Account>("/auth/login", { username, password }));
      if (screen === "recover-id") {
        const found = (await post<{ username: string }>("/auth/recover-id", { recoveryCode: code })).username;
        setResult(<>아이디는 <b>{found}</b>입니다.</>);
      }
      if (screen === "reset") {
        const result = await post<{ recoveryCode: string }>("/auth/reset-password", { username, recoveryCode: code, newPassword: password });
        setRegistered(null);
        setRecoveryCode(result.recoveryCode);
        setScreen("recovery-code");
      }
      if (screen === "email-recovery") setResult((await post<{ message: string }>("/auth/email-recovery", { email })).message + " 메일이 오지 않으면 스팸함과 주소를 확인해 주세요.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "요청에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (screen === "recovery-code") return <div className="auth-content recovery-content">
    <h1>계정 복구 코드</h1>
    <p>이 코드는 아이디와 비밀번호를 찾을 때 필요합니다. 다른 곳에 안전하게 보관해 주세요. 다시 표시되지 않습니다.</p>
    <code>{recoveryCode}</code>
    {registered
      ? <button className="solid-button" onClick={() => { setRecoveryCode(""); void onAuthenticated(registered); }}>보관했어요 · 시작하기</button>
      : <button className="solid-button" onClick={() => { setScreen("login"); setRecoveryCode(""); }}>보관했어요 · 로그인</button>}
  </div>;

  const asksUsername = screen === "login" || screen === "register" || screen === "reset";
  const asksCode = screen === "recover-id" || screen === "reset";
  return <div className="auth-content">
    <div className="auth-top">{screen !== "login" && <button aria-label="뒤로" onClick={() => setScreen("login")}><ArrowLeft /></button>}</div>
    <h1>{titles[screen]}</h1>
    {hints[screen] && <p className="auth-hint">{hints[screen]}</p>}
    <form onSubmit={submit} className="auth-form">
      {asksUsername && <input aria-label="아이디" placeholder="아이디" autoComplete="username" required minLength={screen === "register" ? 4 : undefined} maxLength={32}
        value={username} onChange={event => setUsername(event.target.value)} />}
      {screen === "register" && <input aria-label="이름" placeholder="이름" required maxLength={30} value={displayName} onChange={event => setDisplayName(event.target.value)} />}
      {asksCode && <input aria-label="복구 코드" placeholder="복구 코드" required value={code} onChange={event => setCode(event.target.value)} />}
      {asksUsername && <input aria-label={screen === "reset" ? "새 비밀번호" : "비밀번호"} type="password" placeholder={screen === "reset" ? "새 비밀번호 (8자 이상)" : "비밀번호"}
        autoComplete={screen === "login" ? "current-password" : "new-password"} required minLength={screen === "login" ? undefined : 8}
        value={password} onChange={event => setPassword(event.target.value)} />}
      {(screen === "register" || screen === "email-recovery") && <input aria-label="이메일" type="email" autoComplete="email" maxLength={254}
        placeholder={screen === "register" ? "이메일 (선택 · 비밀번호를 잊었을 때)" : "이메일"} required={screen === "email-recovery"}
        value={email} onChange={event => setEmail(event.target.value)} />}
      {screen === "register" && <label className="auth-consent">
        <input type="checkbox" required checked={agreed} onChange={event => setAgreed(event.target.checked)} />
        <span>(필수) 만 14세 이상이며, <button type="button" onClick={() => onLegal("terms")}>이용약관</button>과 <button type="button" onClick={() => onLegal("privacy")}>개인정보처리방침</button>에 동의합니다.</span>
      </label>}
      <button disabled={busy || loading} className="solid-button">{busy ? "처리 중..." : submitLabels[screen]}</button>
    </form>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {result && <p className="auth-result" role="status">{result}</p>}
    {screen === "login" && <>
      <div className="auth-links">
        <button onClick={() => setScreen("recover-id")}>아이디 찾기</button>
        <button onClick={() => setScreen("reset")}>비밀번호 찾기</button>
        <button onClick={() => setScreen("register")}>회원가입 하기</button>
      </div>
      <button className="auth-email-link" onClick={() => setScreen("email-recovery")}>복구 코드가 없나요? 이메일로 찾기</button>
      <button className="demo-link" onClick={onDemo}>로그인 없이 기기에서 체험하기</button>
      <LegalLinks onLegal={onLegal} />
    </>}
  </div>;
}
