import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { getTourSteps, type TourStep } from "./steps";
import { isTourPending, setTourPending } from "./storage";

type TourContextValue = {
  active: boolean;
  steps: TourStep[];
  stepIndex: number;
  step: TourStep | null;
  templateId: string | null;
  start: () => Promise<void>;
  next: () => void;
  skip: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const baseSteps = useMemo(
    () => getTourSteps(user?.role),
    [user?.role],
  );
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [steps, setSteps] = useState(baseSteps);

  const finish = useCallback(() => {
    setTourPending(false);
    setActive(false);
    setStepIndex(0);
  }, []);

  const goToStep = useCallback(
    (index: number, list: TourStep[], tid: string | null) => {
      const step = list[index];
      if (!step) {
        finish();
        return;
      }
      setStepIndex(index);
      const path = step.path({ templateId: tid });
      navigate(path);
    },
    [finish, navigate],
  );

  const start = useCallback(async () => {
    if (!token || baseSteps.length === 0) {
      setTourPending(false);
      return;
    }

    let tid: string | null = null;
    const needsMarket = baseSteps.some((s) => s.needsTemplate);
    const needsOwned = baseSteps.some((s) => s.needsOwnedTemplate);

    if (needsOwned) {
      try {
        const res = await api.templates(token);
        tid = res.templates[0]?.id ?? null;
      } catch {
        tid = null;
      }
    } else if (needsMarket) {
      try {
        const res = await api.marketplace(token);
        tid = res.templates[0]?.id ?? null;
      } catch {
        tid = null;
      }
    }

    const list = baseSteps.filter((s) => {
      if (s.needsTemplate && !tid) return false;
      if (s.needsOwnedTemplate && !tid) return false;
      return true;
    });

    if (list.length === 0) {
      setTourPending(false);
      return;
    }

    setTemplateId(tid);
    setSteps(list);
    setActive(true);
    goToStep(0, list, tid);
  }, [baseSteps, goToStep, token]);

  const next = useCallback(() => {
    if (!active) return;
    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      finish();
      return;
    }
    goToStep(nextIndex, steps, templateId);
  }, [active, finish, goToStep, stepIndex, steps, templateId]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  useEffect(() => {
    if (!token || !user || !isTourPending() || active) return;
    void start();
  }, [token, user, active, start]);

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      steps,
      stepIndex,
      step: active ? (steps[stepIndex] ?? null) : null,
      templateId,
      start,
      next,
      skip,
    }),
    [active, next, skip, start, stepIndex, steps, templateId],
  );

  return (
    <TourContext.Provider value={value}>{children}</TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
