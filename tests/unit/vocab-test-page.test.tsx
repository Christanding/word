import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VocabTestPage from "@/app/app/vocab-test/page";
import type { VocabAssessmentState } from "@/lib/vocab-test/types";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/app/language-provider", () => ({
  useLanguage: () => ({
    language: "zh",
    t: (key: string) => key,
  }),
}));

function makeState(overrides: Partial<VocabAssessmentState> = {}): VocabAssessmentState {
  return {
    sessionId: "session-1",
    status: "in_progress",
    startedAt: "2026-01-01T00:00:00.000Z",
    startedLevel: "cet6",
    currentLevel: "cet6",
    questionCount: 1,
    aiQuestionCount: 0,
    confidence: 0.5,
    estimatedVocab: 6000,
    recommendedLevel: "cet6",
    askedWords: ["concede"],
    answers: [],
    correctStreak: 0,
    seenOptionMeanings: [],
    currentQuestion: {
      id: "q-1",
      level: "cet6",
      word: "concede",
      pos: "v.",
      correctMeaning: "v. 承认；退让；vi. 让步",
      options: [
        "n. 餐巾, 餐巾纸, 尿布",
        "v. 承认；退让；vi. 让步",
        "n. 年长者, 老人, 前辈；a. 年长的, 资深的",
        "n. 测试, 试验, 化验, 检验, 考验, 甲壳；vt. 测试, 试验, 化验",
      ],
      explanation: "这是一段解释",
      source: "bank",
    },
    ...overrides,
  };
}

let currentState: VocabAssessmentState;
let answerResponse: Record<string, unknown>;
let prepareNextResponse: Record<string, unknown>;
const scrollToMock = vi.fn();
const scrollIntoViewMock = vi.fn();

describe("vocab-test page", () => {
  beforeEach(() => {
    push.mockReset();
    window.sessionStorage.clear();
    currentState = makeState();
    answerResponse = {
      finished: false,
      feedback: {
        isCorrect: true,
        correctMeaning: "v. 承认；退让；vi. 让步",
      },
      state: { ...currentState, currentQuestion: undefined },
    };
    prepareNextResponse = {
      success: true,
      state: currentState,
    };
    Object.defineProperty(window, "scrollTo", {
      writable: true,
      value: scrollToMock,
    });
    scrollToMock.mockReset();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });
    scrollIntoViewMock.mockReset();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/vocab-test?mode=current")) {
        return new Response(JSON.stringify({ current: currentState }), { status: 200 });
      }
      if (url.includes("/api/vocab-test?mode=history")) {
        return new Response(JSON.stringify({ history: [] }), { status: 200 });
      }
      if (url.endsWith("/api/vocab-test") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "answer") {
          return new Response(JSON.stringify(answerResponse), { status: 200 });
        }
        if (body.action === "prepare_next") {
          return new Response(JSON.stringify(prepareNextResponse), { status: 200 });
        }
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;
  });

  it("does not render explanation row in answer feedback", async () => {
    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));
    fireEvent.click(await screen.findByRole("button", { name: /承认/ }));

    await waitFor(() => {
      expect(screen.getByText("vocabTest.feedback.correct")).toBeInTheDocument();
    });

    expect(screen.getByText(/vocabTest.feedback.answer/)).toBeInTheDocument();
    expect(screen.queryByText(/vocabTest.feedback.explanation/)).not.toBeInTheDocument();
    expect(screen.queryByText("这是一段解释")).not.toBeInTheDocument();
  });

  it("uses green interaction color for main options without changing helper buttons", async () => {
    render(<VocabTestPage />);

    const continueButton = await screen.findByRole("button", { name: "vocabTest.resumeContinue" });
    fireEvent.click(continueButton);

    const mainOption = await screen.findByRole("button", { name: /餐巾/ });
    expect(mainOption).toHaveClass("hover:border-emerald-300", "hover:bg-emerald-50");

    const optionBadge = screen.getByText("A");
    expect(optionBadge).toHaveClass("group-hover:bg-emerald-100", "group-hover:text-emerald-700");

    const unsureButton = screen.getByRole("button", { name: "vocabTest.unsureWord" });
    expect(unsureButton).toHaveClass("border-amber-300", "bg-amber-50", "text-amber-800");

    const unknownButton = screen.getByRole("button", { name: "vocabTest.unknownWord" });
    expect(unknownButton).toHaveClass("border-orange-300", "bg-orange-50", "text-orange-800");
  });

  it("submits unsure immediately without entering a separate mode", async () => {
    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));

    const unsureButton = await screen.findByRole("button", { name: "vocabTest.unsureWord" });
    fireEvent.click(unsureButton);

    await waitFor(() => {
      expect(screen.getByText("vocabTest.feedback.incorrect")).toBeInTheDocument();
    });

    expect(screen.queryByText("vocabTest.unsureHint")).not.toBeInTheDocument();

    const answerCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([input, init]) => String(input).endsWith("/api/vocab-test") && (init as RequestInit | undefined)?.method === "POST"
    );
    const answerRequest = answerCalls
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
      .find((body) => body.action === "answer");

    expect(answerRequest).toMatchObject({
      action: "answer",
      choiceType: "unsure",
      selectedMeaning: null,
    });
  });

  it("keeps resume card on direct visit but auto-restores test after remount during active session", async () => {
    const firstRender = render(<VocabTestPage />);

    const resumeButton = await screen.findByRole("button", { name: "vocabTest.resumeContinue" });
    expect(screen.queryByText("concede")).not.toBeInTheDocument();

    fireEvent.click(resumeButton);
    expect(await screen.findByText("concede")).toBeInTheDocument();

    firstRender.unmount();

    render(<VocabTestPage />);

    expect(await screen.findByText("concede")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "vocabTest.resumeContinue" })).not.toBeInTheDocument();
  });

  it("shows completion conditions and conservative remaining range during test", async () => {
    currentState = makeState({ questionCount: 18, confidence: 0.72 });

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));

    expect(await screen.findByText("concede")).toBeInTheDocument();
    expect(document.body.textContent).toContain("50");
    expect(document.body.textContent).toContain("90%");
    expect(document.body.textContent).toMatch(/\d+-\d+/);
  });

  it("shows finish modal once and then keeps only a compact finish reminder after continue", async () => {
    currentState = makeState({ questionCount: 79, confidence: 0.89 });
    const readyState = makeState({ sessionId: "session-ready", questionCount: 80, confidence: 0.91 });
    currentState.sessionId = "session-ready";
    answerResponse = {
      finished: false,
      readyToFinish: true,
      feedback: {
        isCorrect: true,
        correctMeaning: "v. 承认；退让；vi. 让步",
      },
      state: readyState,
    };
    prepareNextResponse = {
      success: true,
      state: readyState,
    };

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));
    fireEvent.click(await screen.findByRole("button", { name: /承认/ }));

    expect(await screen.findByText("vocabTest.finishModal.title")).toBeInTheDocument();
    expect(document.body.textContent).toContain("90%");

    fireEvent.click(screen.getByRole("button", { name: "vocabTest.finishModal.continue" }));

    expect(await screen.findByText("vocabTest.finishReady.badge")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "vocabTest.finishReady.finish" })).toBeInTheDocument();
    expect(screen.queryByText("vocabTest.finishReady.desc")).not.toBeInTheDocument();
  });

  it("shows composite progress based on volume, confidence, and stability", async () => {
    currentState = makeState({ questionCount: 25, confidence: 0.45 });

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));

    const progressBar = await screen.findByTestId("vocab-progress-bar");
    expect(progressBar).toHaveStyle({ width: "40%" });
  });

  it("finishes directly from the only finish modal even when result is still unstable", async () => {
    currentState = makeState({ sessionId: "session-unstable-finish", questionCount: 80, confidence: 0.91 });
    answerResponse = {
      finished: false,
      readyToFinish: true,
      requiresStabilityConfirmation: true,
      feedback: {
        isCorrect: true,
        correctMeaning: "v. 承认；退让；vi. 让步",
      },
      state: { ...currentState, currentQuestion: undefined },
    };
    prepareNextResponse = {
      success: true,
      state: currentState,
    };

    const finishState = {
      ...currentState,
      status: "completed",
      currentQuestion: undefined,
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/vocab-test?mode=current")) {
        return new Response(JSON.stringify({ current: currentState }), { status: 200 });
      }
      if (url.includes("/api/vocab-test?mode=history")) {
        return new Response(JSON.stringify({ history: [] }), { status: 200 });
      }
      if (url.endsWith("/api/vocab-test") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "answer") {
          return new Response(JSON.stringify(answerResponse), { status: 200 });
        }
        if (body.action === "prepare_next") {
          return new Response(JSON.stringify(prepareNextResponse), { status: 200 });
        }
        if (body.action === "finish" && body.forceFinish) {
          return new Response(
            JSON.stringify({ success: true, finished: true, state: finishState, feedback: answerResponse.feedback }),
            { status: 200 }
          );
        }
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));
    fireEvent.click(await screen.findByRole("button", { name: /承认/ }));

    expect(await screen.findByText("vocabTest.finishModal.title")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "vocabTest.finishModal.finish" }));

    await waitFor(() => {
      expect(screen.getByText("vocabTest.historyTitle")).toBeInTheDocument();
    });

    const finishCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([, init]) => init as RequestInit | undefined)
      .filter((init): init is RequestInit => Boolean(init?.body))
      .map((init) => JSON.parse(String(init!.body)))
      .filter((body) => body.action === "finish");

    expect(finishCalls).toContainEqual(
      expect.objectContaining({ action: "finish", forceFinish: true })
    );
    expect(screen.queryByText("vocabTest.finishConfirm.title")).not.toBeInTheDocument();
  });

  it("shows loading immediately while retest start request is still pending", async () => {
    currentState = makeState({ sessionId: "session-history" });

    let resolveStart: (() => void) | undefined;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/vocab-test?mode=current")) {
        return Promise.resolve(new Response(JSON.stringify({ current: null }), { status: 200 }));
      }
      if (url.includes("/api/vocab-test?mode=history")) {
        return Promise.resolve(new Response(JSON.stringify({ history: [] }), { status: 200 }));
      }
      if (url.endsWith("/api/vocab-test") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "start") {
          return new Promise<Response>((resolve) => {
            resolveStart = () => {
              resolve(new Response(JSON.stringify({ success: true, state: currentState }), { status: 200 }));
            };
          });
        }
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }) as typeof fetch;

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.retest" }));

    expect(await screen.findByText("vocabTest.loading")).toBeInTheDocument();
    expect(screen.queryByText("vocabTest.historyTitle")).not.toBeInTheDocument();

    if (resolveStart) {
      resolveStart();
    }

    expect(await screen.findByText("concede")).toBeInTheDocument();
  });

  it("shows a strong warning for low-confidence completed results in history view", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/vocab-test?mode=current")) {
        return new Response(JSON.stringify({ current: null }), { status: 200 });
      }
      if (url.includes("/api/vocab-test?mode=history")) {
        return new Response(
          JSON.stringify({
            history: [
              {
                id: "history-low-confidence",
                endedAt: "2026-01-01T00:10:00.000Z",
                estimatedVocab: 5999,
                margin: 1200,
                confidence: 0.48,
                recommendedLevel: "cet6",
                lowConfidenceResult: true,
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;

    render(<VocabTestPage />);

    expect(await screen.findByText("vocabTest.lowConfidence.title")).toBeInTheDocument();
    expect(screen.getByText("vocabTest.lowConfidence.desc")).toBeInTheDocument();
    expect(screen.getByText("vocabTest.lowConfidence.retest")).toBeInTheDocument();
    expect(screen.queryByText("vocabTest.finishReady.title")).not.toBeInTheDocument();
  });

  it("shows feedback immediately while answer request is still pending", async () => {
    currentState = makeState({ confidence: 0.63 });

    let resolveAnswer: (() => void) | undefined;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/vocab-test?mode=current")) {
        return Promise.resolve(new Response(JSON.stringify({ current: currentState }), { status: 200 }));
      }
      if (url.includes("/api/vocab-test?mode=history")) {
        return Promise.resolve(new Response(JSON.stringify({ history: [] }), { status: 200 }));
      }
      if (url.endsWith("/api/vocab-test") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "answer") {
          return new Promise<Response>((resolve) => {
            resolveAnswer = () => {
              resolve(new Response(JSON.stringify(answerResponse), { status: 200 }));
            };
          });
        }
        if (body.action === "prepare_next") {
          return Promise.resolve(new Response(JSON.stringify({ success: true, state: currentState }), { status: 200 }));
        }
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }) as typeof fetch;

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));
    fireEvent.click(await screen.findByRole("button", { name: /承认/ }));

    expect(await screen.findByText("vocabTest.feedback.correct")).toBeInTheDocument();
    const nextButton = screen.getByRole("button", { name: "vocabTest.nextQuestionPreparing" });
    expect(nextButton).toBeDisabled();

    if (resolveAnswer) {
      resolveAnswer();
    }

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "vocabTest.nextQuestion" })).not.toBeDisabled();
    });
  });

  it("keeps next-question button disabled until prepare-next request completes", async () => {
    currentState = makeState({ sessionId: "session-prep", confidence: 0.63 });
    answerResponse = {
      finished: false,
      feedback: {
        isCorrect: true,
        correctMeaning: "v. 承认；退让；vi. 让步",
      },
      state: { ...currentState, currentQuestion: undefined },
    };

    let resolvePrepareNext: (() => void) | undefined;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/vocab-test?mode=current")) {
        return Promise.resolve(new Response(JSON.stringify({ current: currentState }), { status: 200 }));
      }
      if (url.includes("/api/vocab-test?mode=history")) {
        return Promise.resolve(new Response(JSON.stringify({ history: [] }), { status: 200 }));
      }
      if (url.endsWith("/api/vocab-test") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "answer") {
          return Promise.resolve(new Response(JSON.stringify(answerResponse), { status: 200 }));
        }
        if (body.action === "prepare_next") {
          return new Promise<Response>((resolve) => {
            resolvePrepareNext = () => {
              resolve(new Response(JSON.stringify({ success: true, state: currentState }), { status: 200 }));
            };
          });
        }
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }) as typeof fetch;

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));
    fireEvent.click(await screen.findByRole("button", { name: /承认/ }));

    expect(await screen.findByText("vocabTest.feedback.correct")).toBeInTheDocument();
    const nextButton = screen.getByRole("button", { name: "vocabTest.nextQuestionPreparing" });
    expect(nextButton).toBeDisabled();

    if (resolvePrepareNext) {
      resolvePrepareNext();
    }

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "vocabTest.nextQuestion" })).not.toBeDisabled();
    });
  });

  it("shows an explicit preparing state before the next question is ready", async () => {
    currentState = makeState({ sessionId: "session-next-status", confidence: 0.63 });
    answerResponse = {
      finished: false,
      feedback: {
        isCorrect: true,
        correctMeaning: "v. 承认；退让；vi. 让步",
      },
      state: { ...currentState, currentQuestion: undefined },
    };

    let resolvePrepareNext: (() => void) | undefined;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/vocab-test?mode=current")) {
        return Promise.resolve(new Response(JSON.stringify({ current: currentState }), { status: 200 }));
      }
      if (url.includes("/api/vocab-test?mode=history")) {
        return Promise.resolve(new Response(JSON.stringify({ history: [] }), { status: 200 }));
      }
      if (url.endsWith("/api/vocab-test") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "answer") {
          return Promise.resolve(new Response(JSON.stringify(answerResponse), { status: 200 }));
        }
        if (body.action === "prepare_next") {
          return new Promise<Response>((resolve) => {
            resolvePrepareNext = () => {
              resolve(new Response(JSON.stringify({ success: true, state: currentState }), { status: 200 }));
            };
          });
        }
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }) as typeof fetch;

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));
    fireEvent.click(await screen.findByRole("button", { name: /承认/ }));

    const nextButton = await screen.findByRole("button", { name: "vocabTest.nextQuestionPreparing" });
    expect(nextButton).toBeDisabled();
    expect(nextButton).toHaveAttribute("aria-busy", "true");

    if (resolvePrepareNext) {
      resolvePrepareNext();
    }

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "vocabTest.nextQuestion" })).not.toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "vocabTest.nextQuestion" })).toHaveAttribute("aria-busy", "false");
  });

  it("scrolls the new question anchor into view when moving to the next prepared question", async () => {
    const initialState = makeState({ confidence: 0.63 });
    currentState = makeState({
      sessionId: "session-next-scroll",
      confidence: 0.63,
      currentQuestion: {
        ...makeState().currentQuestion!,
        id: "q-scroll-2",
        word: "adore",
        correctMeaning: "v. 喜爱；崇拜",
        options: ["v. 喜爱；崇拜", "n. 河流", "adj. 稳定的", "n. 目录"],
      },
    });

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/vocab-test?mode=current")) {
        return Promise.resolve(new Response(JSON.stringify({ current: initialState }), { status: 200 }));
      }
      if (url.includes("/api/vocab-test?mode=history")) {
        return Promise.resolve(new Response(JSON.stringify({ history: [] }), { status: 200 }));
      }
      if (url.endsWith("/api/vocab-test") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "answer") {
          return Promise.resolve(new Response(JSON.stringify(answerResponse), { status: 200 }));
        }
        if (body.action === "prepare_next") {
          return Promise.resolve(new Response(JSON.stringify({ success: true, state: currentState }), { status: 200 }));
        }
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }) as typeof fetch;

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));
    fireEvent.click(await screen.findByRole("button", { name: /承认/ }));

    const nextButton = await screen.findByRole("button", { name: "vocabTest.nextQuestion" });
    await waitFor(() => {
      expect(nextButton).not.toBeDisabled();
    });

    scrollIntoViewMock.mockClear();

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it("switches question content immediately after clicking next", async () => {
    currentState = makeState({
      sessionId: "session-next-sync",
      currentQuestion: {
        ...makeState().currentQuestion!,
        id: "q-2",
        word: "adore",
        correctMeaning: "v. 喜爱；崇拜",
        options: ["v. 喜爱；崇拜", "n. 河流", "adj. 稳定的", "n. 目录"],
      },
    });

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/vocab-test?mode=current")) {
        return Promise.resolve(new Response(JSON.stringify({ current: makeState() }), { status: 200 }));
      }
      if (url.includes("/api/vocab-test?mode=history")) {
        return Promise.resolve(new Response(JSON.stringify({ history: [] }), { status: 200 }));
      }
      if (url.endsWith("/api/vocab-test") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "answer") {
          return Promise.resolve(new Response(JSON.stringify(answerResponse), { status: 200 }));
        }
        if (body.action === "prepare_next") {
          return Promise.resolve(new Response(JSON.stringify({ success: true, state: currentState }), { status: 200 }));
        }
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }) as typeof fetch;

    render(<VocabTestPage />);

    fireEvent.click(await screen.findByRole("button", { name: "vocabTest.resumeContinue" }));
    expect(await screen.findByText("concede")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /承认/ }));
    const nextButton = await screen.findByRole("button", { name: "vocabTest.nextQuestion" });
    await waitFor(() => {
      expect(nextButton).not.toBeDisabled();
    });

    fireEvent.click(nextButton);

    expect(screen.getByText("adore")).toBeInTheDocument();
    expect(screen.queryByText("concede")).not.toBeInTheDocument();
  });
});
