import {register, Counter, Histogram, Gauge} from 'prom-client';

export class MetricsCollector {
  private counters: Map<string, Counter<string>> = new Map();
  private histograms: Map<string, Histogram<string>> = new Map();
  private gauges: Map<string, Gauge<string>> = new Map();

  incrementCounter(name: string, labels?: Record<string, string>) {
    if (!this.counters.has(name)) {
      this.counters.set(
        name,
        new Counter({
          name,
          help: `Counter for ${name}`,
          labelNames: Object.keys(labels || {}),
        })
      );
    }

    if (labels) {
      this.counters.get(name)!.inc(labels);
    } else {
      this.counters.get(name)!.inc();
    }
  }

  observeHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>
  ) {
    if (!this.histograms.has(name)) {
      this.histograms.set(
        name,
        new Histogram({
          name,
          help: `Histogram for ${name}`,
          labelNames: Object.keys(labels || {}),
        })
      );
    }

    this.histograms.get(name)!.observe(labels ?? {}, value);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>) {
    if (!this.gauges.has(name)) {
      this.gauges.set(
        name,
        new Gauge({
          name,
          help: `Gauge for ${name}`,
          labelNames: Object.keys(labels || {}),
        })
      );
    }

    this.gauges.get(name)!.set(labels ?? {}, value);
  }

  getMetrics() {
    return register.metrics();
  }
}