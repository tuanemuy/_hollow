import { readConfig, resourceNames, workerNames } from "./config.ts";
import { createD1 } from "./d1.ts";
import { createDnsAndRoutes } from "./dns.ts";
import { createQueues } from "./queues.ts";
import { createR2Buckets } from "./r2.ts";
import { workerSecretSpecs } from "./secrets.ts";

const cfg = readConfig();

const d1 = createD1(cfg);
const queues = createQueues(cfg);
const r2 = createR2Buckets(cfg);
const dns = createDnsAndRoutes(cfg);

const names = resourceNames(cfg);
const workers = workerNames(cfg);

export const stage = cfg.stage;
export const appName = cfg.appName;
export const hostname = cfg.hostname;
export const appUrl = `https://${cfg.hostname}`;

export const d1DatabaseId = d1.id;
export const d1DatabaseName = names.d1;

export const eventsQueueName = names.eventsQueue;
export const eventsDlqQueueName = names.eventsDlqQueue;
export const eventsQueueId = queues.events.id;
export const eventsDlqQueueId = queues.dlq.id;

export const tempFilesBucketName = names.tempFilesBucket;
export const objectsBucketName = names.objectsBucket;
export const tempFilesBucketId = r2.tempFiles.id;
export const objectsBucketId = r2.objects.id;

export const workerNamesOut = workers;

export const zoneId = dns.zone.id;
export const routePattern = dns.route.pattern;

export const requiredSecrets = workerSecretSpecs(cfg);
