import { Get, Router } from '../router';
import { injectable, multiInject } from 'inversify';
import { MetricsRegistry } from './registry';

@injectable()
export class MetricsRouter extends Router {

    constructor(
        @multiInject(MetricsRegistry)
        protected registries: MetricsRegistry[]
    ) {
        super();
    }

    @Get({
        path: '/metrics'
    })
    async metrics() {
        this.ctx.type = 'text/plain; version=0.0.4';
        return this.registries.map(_ => _.report()).join('\n\n');
    }

}
