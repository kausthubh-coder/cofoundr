"use client";

import { useEffect, useState } from "react";

export default function Countdown({
  target,
}: {
  target: string;
}) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  if (now === 0) {
    return <div className="helper-text">Timer syncing...</div>;
  }

  const targetTime = new Date(target).getTime();
  const distance = Math.max(targetTime - now, 0);
  const totalSeconds = Math.floor(distance / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="countdown">
      <div>
        <strong>{days}</strong>
        <span>days</span>
      </div>
      <div>
        <strong>{hours}</strong>
        <span>hours</span>
      </div>
      <div>
        <strong>{minutes}</strong>
        <span>minutes</span>
      </div>
      <div>
        <strong>{seconds}</strong>
        <span>seconds</span>
      </div>
    </div>
  );
}
