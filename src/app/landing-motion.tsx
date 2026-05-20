"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type RevealTarget = Element | null | undefined;

type RevealOptions = {
  y?: number;
  blur?: number;
  duration?: number;
  stagger?: number;
  start?: string;
  ease?: string;
};

/**
 * Reveal an element, or section-level group of elements, on scroll with the shared blur-rise motion language.
 */
function revealOnScroll(
  targets: RevealTarget | RevealTarget[],
  {
    y = 16,
    blur = 8,
    duration = 0.8,
    stagger = 0.5,
    start = "top 85%",
    ease = "power3.out"
  }: RevealOptions = {}
) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const arr = (Array.isArray(targets) ? targets : [targets]).filter(
    (target): target is Element => Boolean(target)
  );
  if (!arr.length) return;

  gsap.set(arr, {
    opacity: 0,
    y,
    filter: `blur(${blur}px)`,
    willChange: "filter, transform, opacity"
  });

  const tl = gsap.timeline({
    paused: true,
    defaults: { ease },
    onStart: () => gsap.set(arr, { willChange: "filter, transform, opacity" }),
    onComplete: () => gsap.set(arr, { willChange: "auto" }),
    onReverseComplete: () => gsap.set(arr, { willChange: "auto" })
  });

  arr.forEach((el, i) => {
    tl.to(
      el,
      { opacity: 1, y: 0, filter: "blur(0px)", duration },
      i === 0 ? 0 : `-=${stagger}`
    );
  });

  const trigger = ScrollTrigger.create({
    trigger: arr[0].closest("section") || arr[0],
    start,
    animation: tl,
    toggleActions: "play none none reverse"
  });

  return () => {
    trigger.kill();
    tl.kill();
    gsap.set(arr, { clearProps: "willChange" });
  };
}

function popIn(targets: RevealTarget | RevealTarget[], { delay = 0, start = "top 85%" } = {}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const arr = (Array.isArray(targets) ? targets : [targets]).filter(
    (target): target is Element => Boolean(target)
  );
  if (!arr.length) return;

  gsap.set(arr, { opacity: 0, scale: 0.92, y: 4, willChange: "transform, opacity" });

  const tl = gsap.timeline({
    paused: true,
    defaults: { ease: "back.out(1.4)" },
    onStart: () => gsap.set(arr, { willChange: "transform, opacity" }),
    onComplete: () => gsap.set(arr, { willChange: "auto" }),
    onReverseComplete: () => gsap.set(arr, { willChange: "auto" })
  });
  tl.to(arr, { opacity: 1, scale: 1, y: 0, duration: 0.5, stagger: 0.06 }, delay);

  const trigger = ScrollTrigger.create({
    trigger: arr[0].closest("section") || arr[0],
    start,
    animation: tl,
    toggleActions: "play none none reverse"
  });

  return () => {
    trigger.kill();
    tl.kill();
    gsap.set(arr, { clearProps: "willChange" });
  };
}

export function LandingMotion({ children }: { children: ReactNode }) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scopeRef.current;
      if (!root) return;

      const all = (selector: string) => Array.from(root.querySelectorAll(selector));
      const cleanups = [
        revealOnScroll(all(".hero-copy h1, .hero-copy > p:not(.small-kicker), .hero-actions"), {
          y: 18,
          blur: 10,
          stagger: 0.5
        }),
        revealOnScroll(
          all(
            "#email-interface > .section-heading, #email-interface > .email-card, #email-interface > .interface-line"
          ),
          {
            duration: 0.95,
            stagger: 0.42,
            start: "top 72%"
          }
        ),
        revealOnScroll(all("#how-it-works > .section-heading, #how-it-works > .step-grid")),
        revealOnScroll(all(
          "#what-she-handles > .section-heading, #what-she-handles > .handle-grid"
        )),
        revealOnScroll(all(
          ".approval-section > .section-heading, .approval-section > .approval-thread, .approval-section > .interface-line"
        )),
        revealOnScroll(
          all(".not-section > h2, .not-section > .not-lines, .not-section > .not-resolution"),
          {
            y: 22,
            blur: 12,
            start: "top 80%"
          }
        ),
        revealOnScroll(all(".promise-section > .promise-copy .promise-line"), {
          y: 22,
          blur: 12,
          start: "top 80%"
        }),
        revealOnScroll(all(".pricing-section > .section-heading, .pricing-section > .price-card")),
        revealOnScroll(all(".faq-section > .section-heading, .faq-section > .faq-list")),
        revealOnScroll(all(".final-cta > h2")),
        popIn(all(".final-cta > .pill-button"), { delay: 0.12 })
      ];

      return () => {
        cleanups.forEach((cleanup) => cleanup?.());
      };
    },
    { scope: scopeRef }
  );

  return <div ref={scopeRef}>{children}</div>;
}
