import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal
} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {ToastrService} from 'ngx-toastr';
import {AccountService, NoonaLoginConfig} from '../../_services/account.service';
import {MemberService} from '../../_services/member.service';
import {NavService} from '../../_services/nav.service';
import {SplashContainerComponent} from '../_components/splash-container/splash-container.component';
import {translate, TranslocoDirective} from "@jsverse/transloco";
import {environment} from "../../../environments/environment";
import {ImageComponent} from "../../shared/image/image.component";
import {SettingsService} from 'src/app/admin/settings.service';
import {OidcPublicConfig} from "../../admin/_models/oidc-config";
import {firstValueFrom, forkJoin} from 'rxjs';

const NOONA_ADMIN_BOOTSTRAP_POLL_ATTEMPTS = 10;
const NOONA_ADMIN_BOOTSTRAP_POLL_DELAY_MS = 2000;
const NOONA_ADMIN_BOOTSTRAP_WAITING_MESSAGE =
  'Noona is still waiting for managed Kavita setup to finish. If you are in the middle of setup, return to Moon, finish the Kavita hand-off, then come back here.';
const NOONA_ADMIN_BOOTSTRAP_FAILED_MESSAGE =
  'Kavita is still locked behind Noona sign-in. Return to Moon, finish the managed Kavita API-key hand-off, then refresh this page.';
const NOONA_ADMIN_BOOTSTRAP_ERROR_MESSAGE =
  'Kavita could not confirm whether the managed Noona login hand-off is complete. Return to Moon and try again.';

@Component({
  selector: 'app-user-login',
  templateUrl: './user-login.component.html',
  styleUrls: ['./user-login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SplashContainerComponent, ReactiveFormsModule, RouterLink, TranslocoDirective, ImageComponent]
})
export class UserLoginComponent implements OnInit {

  private readonly accountService = inject(AccountService);
  private readonly router = inject(Router);
  private readonly memberService = inject(MemberService);
  private readonly toastr = inject(ToastrService);
  private readonly navService = inject(NavService);
  private readonly cdRef = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  noonaAdminBootstrapState = signal<'ready' | 'waiting' | 'failed'>('ready');
  protected readonly settingsService = inject(SettingsService);
  noonaAdminBootstrapMessage = signal('');
  showNoonaAdminBootstrapNotice = computed(() => this.noonaAdminBootstrapState() !== 'ready');

  baseUrl = environment.apiUrl.substring(0, environment.apiUrl.indexOf("api"));

  loginForm: FormGroup = new FormGroup({
    username: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.required, Validators.maxLength(256), Validators.minLength(6), Validators.pattern("^.{6,256}$")])
  });

  /**
   * Used for first time the page loads to ensure no flashing
   */
  isLoaded = signal(false);
  isSubmitting = signal(false);
  /**
   * undefined until query params are read
   */
  skipAutoLogin = signal<boolean | undefined>(undefined);
  /**
   * Display the login form, regardless of OIDC password-authentication settings.
   * Set from query
   */
  forceShowPasswordLogin = signal(false);
  oidcConfig = signal<OidcPublicConfig | undefined>(undefined);
  noonaConfig = signal<NoonaLoginConfig | undefined>(undefined);
  private readonly destroyRef = inject(DestroyRef);
  private noonaAdminBootstrapPollGeneration = 0;

  /**
   * Display the login form
   */
  showPasswordLogin = computed(() => {
    const loaded = this.isLoaded();
    const noonaConfig = this.noonaConfig();
    const config = this.oidcConfig();
    const force = this.forceShowPasswordLogin();
    if (!loaded) return false;
    if (noonaConfig?.disablePasswordLogin) return false;
    if (force) return true;

    return !!config && !(config.enabled && config.disablePasswordAuthentication);
  });
  showOidcButton = computed(() => this.oidcConfig()?.enabled ?? false);
  showNoonaButton = computed(() => this.noonaConfig()?.enabled ?? false);
  private noonaAdminBootstrapPollCancelled = false;

  constructor() {
    this.navService.hideNavBar();
    this.navService.hideSideNav();
    this.destroyRef.onDestroy(() => {
      this.noonaAdminBootstrapPollCancelled = true;
      this.noonaAdminBootstrapPollGeneration += 1;
    });

    effect(() => {
      const skipAutoLogin = this.skipAutoLogin();
      const oidcConfig = this.oidcConfig();

      if (!oidcConfig || !oidcConfig.enabled || skipAutoLogin === undefined) return;

      if (oidcConfig.autoLogin && !skipAutoLogin) {
        window.location.href = this.baseUrl + 'oidc/login';
      }
    });

    effect(() => {
      const user = this.accountService.currentUser();
      if (!user) return;
      this.navService.handleLogin();
      this.cdRef.markForCheck();
    });

  }

  ngOnInit(): void {
    this.settingsService.getPublicOidcConfig().subscribe(config => {
      this.oidcConfig.set(config);
    });
    forkJoin({
      noonaConfig: this.accountService.getNoonaConfig(),
      adminExists: this.memberService.adminExists(),
    }).subscribe({
      next: ({noonaConfig, adminExists}) => {
        this.noonaConfig.set(noonaConfig);

        if (!adminExists) {
          if (noonaConfig.enabled && noonaConfig.disablePasswordLogin) {
            this.beginNoonaAdminBootstrapWait();
            return;
          }

          this.router.navigateByUrl('registration/register');
          return;
        }

        this.noonaAdminBootstrapState.set('ready');
        this.noonaAdminBootstrapMessage.set('');
        this.isLoaded.set(true);
      },
      error: () => {
        this.noonaAdminBootstrapState.set('failed');
        this.noonaAdminBootstrapMessage.set(NOONA_ADMIN_BOOTSTRAP_ERROR_MESSAGE);
        this.isLoaded.set(true);
      }
    });

    this.route.queryParamMap.subscribe(params => {
      const noonaToken = params.get('noonaToken');
      if (noonaToken != null && noonaToken.length > 0) {
        this.clearHandledLoginQueryParams('noonaToken');
        this.noonaLogin(noonaToken);
        return;
      }

      const val = params.get('apiKey');
      if (val != null && val.length > 0) {
        this.login(val);
        return;
      }

      this.skipAutoLogin.set(params.get('skipAutoLogin') === 'true')
      this.forceShowPasswordLogin.set(params.get('forceShowPassword') === 'true');

      const error = params.get('error');
      if (!error) return;

      if (error.startsWith('errors.')) {
        this.toastr.error(translate(error));
      } else {
        this.toastr.error(error);
      }
    });
  }

  private clearHandledLoginQueryParams(...keys: Array<string>) {
    const queryParams = keys.reduce<Record<string, null>>((acc, key) => {
      acc[key] = null;
      return acc;
    }, {});

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  retryNoonaAdminBootstrap() {
    if (this.noonaAdminBootstrapState() === 'waiting') {
      return;
    }

    this.beginNoonaAdminBootstrapWait();
  }

  private async pollForNoonaAdminBootstrap(generation: number) {
    for (let attempt = 1; attempt <= NOONA_ADMIN_BOOTSTRAP_POLL_ATTEMPTS; attempt += 1) {
      if (generation !== this.noonaAdminBootstrapPollGeneration || this.noonaAdminBootstrapPollCancelled) {
        return;
      }

      if (attempt > 1) {
        await new Promise((resolve) => window.setTimeout(resolve, NOONA_ADMIN_BOOTSTRAP_POLL_DELAY_MS));
        if (generation !== this.noonaAdminBootstrapPollGeneration || this.noonaAdminBootstrapPollCancelled) {
          return;
        }
      }

      try {
        const adminExists = await firstValueFrom(this.memberService.adminExists());
        if (generation !== this.noonaAdminBootstrapPollGeneration || this.noonaAdminBootstrapPollCancelled) {
          return;
        }

        if (adminExists) {
          this.noonaAdminBootstrapState.set('ready');
          this.noonaAdminBootstrapMessage.set('');
          return;
        }
      } catch {
        if (attempt >= NOONA_ADMIN_BOOTSTRAP_POLL_ATTEMPTS) {
          break;
        }
      }
    }

    if (generation !== this.noonaAdminBootstrapPollGeneration || this.noonaAdminBootstrapPollCancelled) {
      return;
    }

    this.noonaAdminBootstrapState.set('failed');
    this.noonaAdminBootstrapMessage.set(NOONA_ADMIN_BOOTSTRAP_FAILED_MESSAGE);
  }

  private beginNoonaAdminBootstrapWait() {
    this.noonaAdminBootstrapState.set('waiting');
    this.noonaAdminBootstrapMessage.set(NOONA_ADMIN_BOOTSTRAP_WAITING_MESSAGE);
    this.isLoaded.set(true);
    const generation = ++this.noonaAdminBootstrapPollGeneration;
    void this.pollForNoonaAdminBootstrap(generation);
  }


  login(apiKey: string = '') {
    const model = this.loginForm.getRawValue();
    model.apiKey = apiKey;
    this.isSubmitting.set(true);
    this.accountService.login(model).subscribe({
      next: () => {
        this.loginForm.reset();
        this.navService.handleLogin()

        this.isSubmitting.set(false);
      },
      error: (err) => {
        this.toastr.error(err.error);
        this.isSubmitting.set(false);
      }
    });
  }

  noonaLogin(token: string) {
    this.isSubmitting.set(true);
    this.accountService.noonaLogin(token).subscribe({
      next: () => {
        this.loginForm.reset();
        this.navService.handleLogin();
        this.isSubmitting.set(false);
      },
      error: (err) => {
        this.toastr.error(err.error);
        this.isSubmitting.set(false);
      }
    });
  }

  loginWithNoona() {
    const moonBaseUrl = (this.noonaConfig()?.moonBaseUrl || '').replace(/\/+$/, '');
    if (!moonBaseUrl) return;

    const moonRoot = `${moonBaseUrl}/`;
    const kavitaLoginUrl = new URL(window.location.href);
    kavitaLoginUrl.search = '';
    kavitaLoginUrl.hash = '';
    const moonCallbackUrl = new URL('kavita/complete', moonRoot);
    moonCallbackUrl.searchParams.set('target', kavitaLoginUrl.toString());

    const moonLoginUrl = new URL('login', moonRoot);
    moonLoginUrl.searchParams.set('returnTo', moonCallbackUrl.toString());
    window.location.href = moonLoginUrl.toString();
  }
}
