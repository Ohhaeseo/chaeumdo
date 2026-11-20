import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const photo = fileURLToPath(new URL("../public/icons/icon-512.png", import.meta.url));
const password = "E2e-password-2026";
let created: string | null = null;

async function signUp(page: Page) {
  const username = `e2e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/");
  await page.getByRole("button", { name: "회원가입 하기" }).click();
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("이름").fill("화면테스트");
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(page.getByRole("heading", { name: "계정 복구 코드" })).toBeVisible();
  created = username;
  await page.getByRole("button", { name: "보관했어요 · 시작하기" }).click();
  await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();
}

// Removes the test account through the API, so a failed or timed-out test leaves nothing behind.
test.afterEach(async ({ request }) => {
  if (!created) return;
  const headers = { "X-Requested-With": "chaeummdo" };
  const login = await request.post("/api/auth/login", { headers, data: { username: created, password } });
  if (login.ok()) await request.post("/api/auth/delete", { headers, data: { password } });
  created = null;
});

test("가입부터 기록 저장·수정·삭제와 탈퇴까지, 뒤로가기와 함께 동작한다", async ({ page }) => {
  await signUp(page);

  // An open sheet closes on back before the screen changes.
  await page.getByRole("button", { name: "지역 검색" }).click();
  await expect(page.getByRole("dialog", { name: "지역 검색" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "지역 검색" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();

  await page.getByRole("button", { name: "여행기록 추가" }).click();
  await page.getByLabel("시·도", { exact: true }).selectOption("26");
  await page.getByLabel("시·군·구", { exact: true }).selectOption({ label: "해운대구" });
  await page.getByRole("button", { name: "선택한 지역 추가" }).click();
  await page.getByLabel("대표 사진").setInputFiles(photo);
  await page.getByLabel("시작일").fill("2026-10-03");
  await page.getByLabel("종료일").fill("2026-10-04");
  await page.getByRole("button", { name: "방문장소 추가" }).first().click();
  await page.getByLabel("DAY 1 장소 1", { exact: true }).fill("해운대 해수욕장");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "부산광역시 해운대구 여행 기록 완료 !" })).toBeVisible();

  await page.getByRole("button", { name: "지도에서 보기" }).click();
  await expect(page).toHaveURL(/\/provinces\/26$/);
  await expect(page.locator(".district-progress").first()).toHaveText("1 / 16개 시·군·구를 채웠어요");
  // The completion screen took the form's place, so back returns to the map.
  await page.goBack();
  await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();
  await expect(page.getByRole("button", { name: "부산, 방문, 시·군·구 보기" })).toBeAttached();

  // 부산 is small, so its photo pin sits on top of the shape; a finger taps the pin.
  await page.locator(".photo-marker").filter({ hasText: "부산" }).click();
  await expect(page).toHaveURL(/\/provinces\/26$/);
  await page.locator(".district-list button", { hasText: "해운대구" }).click();
  await page.locator(".record-card").click();
  await expect(page).toHaveURL(/\/regions\/26350\/trips\/[0-9a-f-]+$/);
  await expect(page.getByText("해운대 해수욕장")).toBeVisible();

  await page.getByRole("button", { name: "여행 기록 수정" }).click();
  await page.getByRole("button", { name: "동행자 추가" }).click();
  await page.getByLabel("동행자 1 이름").fill("민지");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: /여행 기록 완료/ })).toBeVisible();
  await page.goBack();
  await expect(page.locator(".companion small")).toHaveText(["민지"]);

  // A refresh keeps the screen.
  await page.reload();
  await expect(page.getByText("해운대 해수욕장")).toBeVisible();

  await page.getByRole("button", { name: "더보기" }).click();
  await page.getByRole("button", { name: "기록 삭제" }).click();
  await page.locator(".danger-confirm").click();
  await expect(page.getByText("첫 사진으로 해운대구를 채워보세요.")).toBeVisible();
  // Back skips the deleted trip.
  await page.goBack();
  await expect(page.getByRole("heading", { name: "부산광역시" })).toBeVisible();

  await page.goto("/my");
  await page.getByRole("button", { name: "계정 삭제" }).click();
  await page.getByLabel("비밀번호 확인").fill(password);
  await page.locator(".delete-dialog").getByRole("button", { name: "계정 삭제" }).click();
  await expect(page.getByRole("heading", { name: "LOGIN" })).toBeVisible();
  created = null;
});

test("이용약관과 개인정보처리방침은 로그인하지 않아도 열리고, ←는 로그인 화면으로 간다", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "개인정보처리방침" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1. 처리하는 목적" })).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(page.getByRole("heading", { name: "LOGIN" })).toBeVisible();
  await page.getByRole("button", { name: "이용약관" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "제1조 목적" })).toBeVisible();
});
