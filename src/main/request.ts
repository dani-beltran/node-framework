import fetch from 'node-fetch';
import querystring from 'querystring';
import { util } from '.';
import { injectable, inject } from 'inversify';
import { Logger } from './logger';

const NETWORK_ERRORS = [
    'EAI_AGAIN',
    'EHOSTDOWN',
    'EHOSTUNREACH',
    'ECONNABORTED',
    'ECONNREFUSED',
    'ECONNRESET',
    'EPIPE'
];

export interface RequestOptions {
    body?: any;
    query?: { [key: string]: any };
    headers?: { [key: string]: string };
}

export interface RequestConfig {
    baseUrl: string;
    authKey: string;
    retryAttempts?: number;
    retryDelay?: number;
    headers?: { [key: string]: string };
}

export type RequestFunction = (options: RequestOptions) => Promise<any>;

@injectable()
export class RequestFactory {
    @inject(Logger)
    logger!: Logger;

    create(config: RequestConfig): Request {
        return new Request(this, config);
    }
}

export class Request {
    factory: RequestFactory;
    config: RequestConfig;

    constructor(factory: RequestFactory, config: RequestConfig) {
        this.factory = factory;
        this.config = config;
    }

    get logger(): Logger {
        return this.factory.logger;
    }

    async get(url: string, options: RequestOptions = {}): Promise<any> {
        return await this.send('get', url, options);
    }

    async post(url: string, options: RequestOptions = {}): Promise<any> {
        return await this.send('post', url, options);
    }

    async put(url: string, options: RequestOptions = {}): Promise<any> {
        return await this.send('put', url, options);
    }

    async delete(url: string, options: RequestOptions = {}): Promise<any> {
        return await this.send('delete', url, options);
    }

    async send(method: string, url: string, options: RequestOptions = {}): Promise<any> {
        const { baseUrl, authKey } = this.config;
        // Prepare headers
        const authHeader = 'Basic ' + Buffer.from(authKey + ':').toString('base64');
        const headers: { [key: string]: string } = {
            Authorization: authHeader,
            ...this.config.headers,
            ...options.headers
        };
        // Prepare body
        let body = options.body || null;
        if (body) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }
        // Prepare URL
        const qs = querystring.stringify(options.query || {});
        const fullUrl = baseUrl + url + (qs ? '?' + qs : '');
        // Send request
        const res = await this.fetchWithRetry(fullUrl, {
            method,
            body,
            headers
        });
        const { status } = res;
        if (status === 204) {
            // No response
            return null;
        }
        if (!res.ok) {
            const text = await res.text();
            throw this.createErrorFromResponse(method, url, fullUrl, status, text);
        }
        const json = await res.json();
        return json;
    }

    async fetchWithRetry(fullUrl: string, fetchOptions: any): Promise<any> {
        const { retryAttempts = 20, retryDelay = 1000 } = this.config;
        let attempted = 0;
        let lastError = null;
        while (attempted < retryAttempts) {
            try {
                attempted += 1;
                return await fetch(fullUrl, fetchOptions);
            } catch (e) {
                if (NETWORK_ERRORS.includes(e.code)) {
                    lastError = e;
                    await new Promise(r => setTimeout(r, retryDelay));
                } else {
                    throw e;
                }
            }
        }
        throw lastError;
    }

    createErrorFromResponse(
        method: string,
        url: string,
        fullUrl: string,
        status: number,
        responseText: string
    ): Error {
        try {
            const json = JSON.parse(responseText);
            return util.createError({
                name: json.name,
                message: json.message,
                details: json.details,
                status
            });
        } catch (err) {
            this.logger.warn(`Request failed: unable to parse response JSON`, {
                details: {
                    method,
                    url,
                    fullUrl,
                    status,
                    responseText
                },
                error: {
                    name: err.name,
                    message: err.name
                }
            });
            return util.createError({
                name: 'InternalError',
                message: 'The request cannot be processed'
            });
        }
    }

}
