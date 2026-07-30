import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID, Service, StateKey, TransferState } from '@angular/core';

@Service()
export class HomeTransferStateService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly transferState = inject(TransferState);

  async load<T>(key: StateKey<T>, loader: () => Promise<T>): Promise<T> {
    if (this.transferState.hasKey(key)) {
      const value = this.transferState.get(key, undefined as T);

      if (isPlatformBrowser(this.platformId)) {
        this.transferState.remove(key);
      }

      return value;
    }

    const value = await loader();

    if (isPlatformServer(this.platformId)) {
      this.transferState.set(key, value);
    }

    return value;
  }
}
