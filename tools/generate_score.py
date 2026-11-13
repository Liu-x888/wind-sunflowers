"""Generate the fixed piano and harp score used by Wind in the Lilies."""

from pathlib import Path
import wave

import numpy as np


SAMPLE_RATE = 22050
DURATION = 56.0
OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "wind-sunflowers-score.wav"
RNG = np.random.default_rng(660066)


def midi(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def add_note(buffer: np.ndarray, start: float, note: float, duration: float, kind: str) -> None:
    start_index = int(start * SAMPLE_RATE)
    note_length = int(min(duration, DURATION - start) * SAMPLE_RATE)
    if note_length <= 0:
        return

    t = np.arange(note_length, dtype=np.float64) / SAMPLE_RATE
    if kind == "piano":
        attack = np.minimum(1.0, t / 0.012)
        envelope = attack * np.exp(-t * 1.05) * np.minimum(1.0, (duration - t) / 0.35)
        signal = (
            np.sin(2 * np.pi * note * t) * 0.62
            + np.sin(2 * np.pi * note * 2.004 * t) * 0.22
            + np.sin(2 * np.pi * note * 3.997 * t) * 0.09
            + np.sin(2 * np.pi * note * 5.994 * t) * 0.04
        )
        signal *= envelope
        pan = 0.18 + 0.22 * np.sin(start * 0.9)
    elif kind == "harp":
        attack = np.minimum(1.0, t / 0.006)
        envelope = attack * np.exp(-t * 2.9) * np.minimum(1.0, (duration - t) / 0.22)
        signal = (
            np.sin(2 * np.pi * note * t) * 0.55
            + np.sin(2 * np.pi * note * 2.01 * t) * 0.28
            + np.sin(2 * np.pi * note * 3.98 * t) * 0.12
            + np.sin(2 * np.pi * note * 6.03 * t) * 0.035
        )
        signal *= envelope
        pan = 0.68 + 0.16 * np.cos(start * 1.3)
    else:
        attack = np.minimum(1.0, t / 1.8)
        release = np.minimum(1.0, (duration - t) / 2.2)
        envelope = attack * release
        signal = (
            np.sin(2 * np.pi * note * t) * 0.34
            + np.sin(2 * np.pi * note * 2.002 * t) * 0.09
            + np.sin(2 * np.pi * note * 3.004 * t) * 0.035
        )
        signal *= envelope
        pan = 0.48

    end_index = start_index + note_length
    buffer[start_index:end_index, 0] += signal * (1.0 - pan) * 0.72
    buffer[start_index:end_index, 1] += signal * pan * 0.72


def add_air(buffer: np.ndarray) -> None:
    length = buffer.shape[0]
    t = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    noise = RNG.normal(0, 1, length)
    smoothing = np.convolve(noise, np.ones(281) / 281, mode="same")
    air = smoothing * (0.0025 + 0.0015 * np.sin(2 * np.pi * t / 14.0))
    buffer[:, 0] += air
    buffer[:, 1] += np.roll(air, 911) * 0.92


def add_reverb(buffer: np.ndarray) -> np.ndarray:
    wet = buffer.copy()
    taps = [
        (0.083, 0.21, 0),
        (0.137, 0.16, 1),
        (0.223, 0.12, 0),
        (0.347, 0.09, 1),
        (0.511, 0.06, 0),
    ]
    for delay, gain, channel in taps:
        samples = int(delay * SAMPLE_RATE)
        wet[samples:, channel] += buffer[:-samples, 1 - channel] * gain
    return buffer * 0.78 + wet * 0.22


def main() -> None:
    buffer = np.zeros((int(DURATION * SAMPLE_RATE), 2), dtype=np.float64)
    bar_length = 7.0
    progression = [
        [50, 57, 62, 66, 69],
        [47, 54, 59, 62, 66],
        [43, 50, 55, 59, 62],
        [45, 52, 57, 61, 64],
        [42, 49, 54, 57, 61],
        [47, 54, 59, 62, 66],
        [43, 50, 55, 59, 66],
        [45, 52, 57, 61, 64],
    ]

    for bar_index, chord in enumerate(progression):
        start = bar_index * bar_length
        for note in chord[:3]:
            add_note(buffer, start, midi(note + 12), bar_length + 1.8, "pad")

        piano_pattern = [0, 2, 4, 3, 1, 3, 4, 2]
        for step, note_index in enumerate(piano_pattern):
            note = chord[note_index] + (12 if step in (2, 5) else 0)
            add_note(
                buffer,
                start + step * (bar_length / len(piano_pattern)),
                midi(note),
                3.1,
                "piano",
            )

        harp_notes = [chord[0] + 12, chord[2] + 12, chord[4] + 12, chord[1] + 12]
        for step, note in enumerate(harp_notes):
            add_note(
                buffer,
                start + 0.3 + step * 0.42,
                midi(note),
                2.5,
                "harp",
            )

        if bar_index in (3, 6):
            add_note(buffer, start + 0.15, midi(chord[4] + 24), 2.8, "harp")
            add_note(buffer, start + 0.28, midi(chord[2] + 24), 2.3, "harp")

    add_note(buffer, 50.6, midi(74), 4.2, "piano")
    add_note(buffer, 50.6, midi(81), 4.7, "harp")
    add_note(buffer, 51.2, midi(78), 4.0, "harp")
    add_note(buffer, 52.0, midi(86), 3.2, "harp")
    add_air(buffer)
    buffer = add_reverb(buffer)

    fade_in = np.minimum(1.0, np.arange(buffer.shape[0]) / (SAMPLE_RATE * 2.2))
    fade_out_start = int((DURATION - 3.8) * SAMPLE_RATE)
    fade_out = np.ones(buffer.shape[0])
    fade_out[fade_out_start:] = np.linspace(1.0, 0.0, buffer.shape[0] - fade_out_start) ** 1.4
    buffer *= fade_in[:, None] * fade_out[:, None]

    peak = float(np.max(np.abs(buffer)))
    buffer *= 0.66 / max(peak, 0.001)
    pcm = np.clip(buffer * 32767.0, -32768, 32767).astype(np.int16)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())

    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size / 1024 / 1024:.1f} MiB)")


if __name__ == "__main__":
    main()
