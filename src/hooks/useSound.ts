import { useCallback, useRef, useState } from "react";

export type SoundKey =
  | "draw"
  | "drawDiscard"
  | "discard"
  | "select"
  | "process"
  | "open"
  | "win"
  | "penalty"
  | "deal"
  | "sort";

export function useSound() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("okey101_sound") !== "off";
    } catch {
      return true;
    }
  });

  const audioCtxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const toggleSound = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("okey101_sound", next ? "on" : "off");
      } catch {}
      return next;
    });
  }, []);

  // Frekans sweep'li osillatör
  const playTone = useCallback(
    (
      freq: number,
      dur: number,
      type: OscillatorType = "sine",
      vol: number = 0.25,
      delay: number = 0,
      freqEnd?: number
    ) => {
      if (!enabled) return;
      try {
        const ctx = getCtx();
        const t = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (freqEnd !== undefined) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), t + dur);
        }
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      } catch {}
    },
    [enabled, getCtx]
  );

  // Filtreli beyaz gürültü — normal fonksiyon (hook sayısını sabit tutar)
  const playNoise = (
    dur: number,
    vol: number = 0.15,
    delay: number = 0,
    filterFreq: number = 1000,
    filterType: BiquadFilterType = "bandpass",
    filterQ: number = 1.5
  ) => {
    if (!enabled) return;
    try {
      const ctx = getCtx();
      const t = ctx.currentTime + delay;
      const bufLen = Math.ceil(ctx.sampleRate * (dur + 0.05));
      const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFreq;
      filter.Q.value = filterQ;
      const gain = ctx.createGain();
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.start(t);
      src.stop(t + dur + 0.05);
    } catch {}
  };

  const sounds: Record<SoundKey, () => void> = {
    // Desteden çekme — odunsu tık + yüksek çıtırtı
    draw: () => {
      playNoise(0.05, 0.18, 0, 3000, "highpass", 2);
      playTone(520, 0.06, "triangle", 0.15, 0.01);
      playTone(380, 0.05, "triangle", 0.10, 0.04);
    },

    // Yerden çekme — farklı, biraz daha parlak
    drawDiscard: () => {
      playTone(700, 0.04, "triangle", 0.14, 0);
      playTone(900, 0.05, "triangle", 0.18, 0.03);
      playNoise(0.05, 0.12, 0.02, 2200, "bandpass", 3);
      playTone(1100, 0.07, "sine", 0.10, 0.06);
    },

    // Taş atma — dolgun tok + sürtünme düşüşü
    discard: () => {
      playNoise(0.10, 0.22, 0, 700, "lowpass", 1.2);
      playTone(300, 0.14, "sine", 0.18, 0, 180);
      playNoise(0.06, 0.10, 0.04, 1200, "bandpass", 2);
    },

    // Taş seçme — hafif tık
    select: () => {
      playTone(860, 0.035, "triangle", 0.12, 0);
      playNoise(0.025, 0.09, 0, 3500, "highpass", 2);
    },

    // Pereye taş işleme — snap + kilit sesi
    process: () => {
      playTone(440, 0.04, "triangle", 0.16, 0);
      playTone(880, 0.07, "sine", 0.14, 0.03);
      playTone(1320, 0.05, "sine", 0.10, 0.07);
      playNoise(0.04, 0.12, 0.01, 2400, "bandpass", 3);
    },

    // El açma — majör akor + kıvılcım
    open: () => {
      // C-E-G majör akor
      playTone(523, 0.30, "sine", 0.22, 0);
      playTone(659, 0.30, "sine", 0.20, 0.02);
      playTone(784, 0.32, "sine", 0.20, 0.08);
      // Üst oktav çıkışı
      playTone(1047, 0.25, "sine", 0.18, 0.18);
      playTone(1319, 0.20, "sine", 0.14, 0.26);
      // Kıvılcım efekti
      playNoise(0.10, 0.08, 0.20, 5000, "highpass", 1);
    },

    // Oyun kazanma — tam fanfar
    win: () => {
      const melody = [523, 659, 784, 1047, 784, 1047, 1175, 1047, 1319];
      melody.forEach((freq, i) => {
        playTone(freq, 0.24, "sine", 0.26, i * 0.09);
        // Her notanın altında hafif harmonic
        playTone(freq * 0.5, 0.20, "triangle", 0.08, i * 0.09 + 0.01);
      });
      // Çift ses: beşli aralık paralel
      [523, 659, 784, 1047].forEach((f, i) => {
        playTone(f * 1.5, 0.18, "sine", 0.10, i * 0.10 + 0.04);
      });
      // Zil sesi finale
      playNoise(0.35, 0.14, melody.length * 0.09 - 0.05, 7000, "highpass", 0.8);
      playTone(2093, 0.4, "sine", 0.08, melody.length * 0.09);
    },

    // Ceza — sert buzzer + düşen alarm
    penalty: () => {
      playTone(240, 0.12, "sawtooth", 0.24, 0, 140);
      playTone(200, 0.14, "sawtooth", 0.22, 0.10, 130);
      playTone(170, 0.16, "square", 0.18, 0.22, 110);
      playNoise(0.25, 0.14, 0, 500, "lowpass", 1.5);
      // Titreşimli LFO etkisi: hızla tekrar eden kısa tonlar
      [0, 0.06, 0.12].forEach((d) => playTone(180, 0.04, "sawtooth", 0.15, d));
    },

    // Taş dağıtımı — kartı masaya koyma whoosh
    deal: () => {
      playNoise(0.08, 0.16, 0, 1800, "bandpass", 2.5);
      playTone(380, 0.07, "triangle", 0.12, 0.01, 260);
      playNoise(0.04, 0.07, 0.06, 3000, "highpass", 2);
    },

    // Otomatik sıralama — üç hızlı karıştırma sesi
    sort: () => {
      [0, 0.045, 0.09].forEach((d, i) => {
        playNoise(0.05, 0.14, d, 1400 + i * 200, "bandpass", 2.5);
        playTone(350 + i * 60, 0.04, "triangle", 0.09, d);
      });
    },
  };

  return { sounds, enabled, toggleSound };
}
