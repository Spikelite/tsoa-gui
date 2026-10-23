import { useEffect, useState } from "react";

const FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// The time of day on the screen showing the page, in its own time zone and
// its own way of writing times, so a wall display doubles as a clock. It
// changes on the minute.
export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = setTimeout(tick, 60_000 - (current.getTime() % 60_000));
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    return () => clearTimeout(timer);
  }, []);

  return (
    <time className="clock" dateTime={now.toISOString()} aria-label="Time of day">
      {FORMAT.format(now)}
    </time>
  );
}
