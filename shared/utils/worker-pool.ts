import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import {Logger} from './logger';

interface WorkerPoolOptions {
    minWorkers: number;
    maxWorkers: number;
    workerScript: string;
}

interface WorkerTask {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    data: any;
}

export class WorkerPool extends EventEmitter {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private options: WorkerPoolOptions;
  private logger: Logger;

  constructor(options: WorkerPoolOptions) {
    super();
    this.options = options;
    this.logger = new Logger("WorkerPool");
    this.initializeWorkers();
  }

  private initializeWorkers() {
    for (let i = 0; i < this.options.minWorkers; i++) {
      this.createWorker();
    }
  }

  private createWorker() {
    const worker = new Worker(this.options.workerScript);

    worker.on("message", (result) => {
      this.handleWorkerMessage(worker, result);
    });

    worker.on("error", (error) => {
      this.logger.error("Worker error: ", error);
      this.removeWorker(worker);
      if (this.workers.length < this.options.minWorkers) {
        this.createWorker();
      }
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        this.logger.error(`Worker stopped with exit code ${code}`);
      }
      this.removeWorker(worker);
    });

    this.workers.push(worker);
    this.availableWorkers.push(worker);

    return worker;
  }

  private removeWorker(worker: Worker) {
    const index = this.workers.indexOf(worker);
    if (index > -1) {
      this.workers.splice(index, 1);
    }

    const availableIndex = this.availableWorkers.indexOf(worker);

    if (availableIndex > -1) {
      this.availableWorkers.splice(availableIndex, 1);
    }
  }

  private handleWorkerMessage(worker: Worker, result: any) {
    if (this.workers.includes(worker)) {
      this.availableWorkers.push(worker);
      setImmediate(() => this.processNextTask()); // Defer to next tick
    }
  }

  private processNextTask() {
    if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
      return;
    }

    const task = this.taskQueue.shift()!;
    const worker = this.availableWorkers.shift()!;

    const messageHandler = (result: any) => {
      worker.off("message", messageHandler);  //ensures this function do not called multiple times

      if (result.success) {
        task.resolve(result.result);
      } else {
        task.reject(new Error(result.error));
      }

      // returning worker to pool and process to next task
      this.availableWorkers.push(worker);
      this.processNextTask();
    };

    worker.on("message", messageHandler);
    worker.postMessage(task.data);
  }

  async execute(data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const task: WorkerTask = { resolve, reject, data };

      if (
        this.availableWorkers.length === 0 &&
        this.workers.length < this.options.maxWorkers
      ) {
        this.createWorker();
      }

      if (this.availableWorkers.length > 0) {
        this.taskQueue.push(task);
        this.processNextTask();
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  async shutdown() {
    const shutdownPromises = this.workers.map((worker) => {
      return new Promise<void>((resolve) => {
        worker.once("exit", () => resolve());
        worker.terminate();
      });
    });

    await Promise.all(shutdownPromises);
    this.workers = [];
    this.availableWorkers = [];
  }
}