using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using API.Constants;
using API.Controllers;
using API.Data;
using API.DTOs;
using API.Entities;
using API.Entities.User;
using API.Services;
using API.Services.Caching;
using API.SignalR;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;
using Xunit.Abstractions;

namespace API.Tests.Controllers;

public class AccountControllerTests(ITestOutputHelper outputHelper) : AbstractDbTest(outputHelper)
{
    private const string NoonaManagedFirstAdminMessage =
        "Noona manages the first Kavita admin. Finish setup in Moon or let Warden complete the managed bootstrap.";

    private static readonly SemaphoreSlim EnvLock = new(1, 1);

    [Fact]
    public async Task RegisterFirstUser_ReturnsForbidden_WhenNoonaManagedAndPayloadDoesNotMatchBootstrapAccount()
    {
        await EnvLock.WaitAsync();
        try
        {
            using var _ = new EnvironmentVariableScope(new Dictionary<string, string?>
            {
                ["NOONA_MOON_BASE_URL"] = "https://moon.example.com",
                ["NOONA_SOCIAL_LOGIN_ONLY"] = "true",
                ["KAVITA_ADMIN_USERNAME"] = "reader-admin",
                ["KAVITA_ADMIN_EMAIL"] = "reader-admin@example.com",
                ["KAVITA_ADMIN_PASSWORD"] = "Password123!",
            });

            var (controller, userManager, _) = await CreateControllerAsync();

            var result = await controller.RegisterFirstUser(new RegisterDto
            {
                Username = "someone-else",
                Email = "someone-else@example.com",
                Password = "Password123!",
            });

            var forbidden = Assert.IsType<ObjectResult>(result.Result);
            Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
            Assert.Equal(NoonaManagedFirstAdminMessage, forbidden.Value);
            Assert.Empty(await userManager.GetUsersInRoleAsync(PolicyConstants.AdminRole));
        }
        finally
        {
            EnvLock.Release();
        }
    }

    [Fact]
    public async Task RegisterFirstUser_AllowsBootstrapCredentials_WhenNoonaManaged()
    {
        await EnvLock.WaitAsync();
        try
        {
            using var _ = new EnvironmentVariableScope(new Dictionary<string, string?>
            {
                ["NOONA_MOON_BASE_URL"] = "https://moon.example.com",
                ["NOONA_SOCIAL_LOGIN_ONLY"] = "true",
                ["KAVITA_ADMIN_USERNAME"] = "reader-admin",
                ["KAVITA_ADMIN_EMAIL"] = "reader-admin@example.com",
                ["KAVITA_ADMIN_PASSWORD"] = "Password123!",
            });

            var (controller, userManager, _) = await CreateControllerAsync();

            var result = await controller.RegisterFirstUser(new RegisterDto
            {
                Username = "reader-admin",
                Email = "reader-admin@example.com",
                Password = "Password123!",
            });

            var payload = Assert.IsType<UserDto>(result.Value);
            Assert.Equal("reader-admin", payload.Username);
            Assert.Equal("reader-admin@example.com", payload.Email);
            Assert.Equal("jwt-token", payload.Token);
            Assert.Equal("refresh-token", payload.RefreshToken);

            var admins = await userManager.GetUsersInRoleAsync(PolicyConstants.AdminRole);
            Assert.Single(admins);
            Assert.Equal("reader-admin", admins[0].UserName);
        }
        finally
        {
            EnvLock.Release();
        }
    }

    [Fact]
    public async Task RegisterFirstUser_AllowsStandardRegistration_WhenNoonaLoginIsNotConfigured()
    {
        await EnvLock.WaitAsync();
        try
        {
            using var _ = new EnvironmentVariableScope(new Dictionary<string, string?>
            {
                ["NOONA_MOON_BASE_URL"] = null,
                ["NOONA_SOCIAL_LOGIN_ONLY"] = null,
                ["KAVITA_ADMIN_USERNAME"] = null,
                ["KAVITA_ADMIN_EMAIL"] = null,
                ["KAVITA_ADMIN_PASSWORD"] = null,
            });

            var (controller, userManager, _) = await CreateControllerAsync();

            var result = await controller.RegisterFirstUser(new RegisterDto
            {
                Username = "plain-admin",
                Email = "plain-admin@example.com",
                Password = "Password123!",
            });

            var payload = Assert.IsType<UserDto>(result.Value);
            Assert.Equal("plain-admin", payload.Username);
            Assert.Equal("plain-admin@example.com", payload.Email);
            Assert.Equal("jwt-token", payload.Token);
            Assert.Equal("refresh-token", payload.RefreshToken);

            var admins = await userManager.GetUsersInRoleAsync(PolicyConstants.AdminRole);
            Assert.Single(admins);
            Assert.Equal("plain-admin", admins[0].UserName);
        }
        finally
        {
            EnvLock.Release();
        }
    }

    [Fact]
    public async Task RegisterFirstUser_AllowsManualRegistration_WhenNoonaLoginConfiguredButSocialLoginOnlyDisabled()
    {
        await EnvLock.WaitAsync();
        try
        {
            using var _ = new EnvironmentVariableScope(new Dictionary<string, string?>
            {
                ["NOONA_MOON_BASE_URL"] = "https://moon.example.com",
                ["NOONA_SOCIAL_LOGIN_ONLY"] = "false",
                ["KAVITA_ADMIN_USERNAME"] = null,
                ["KAVITA_ADMIN_EMAIL"] = null,
                ["KAVITA_ADMIN_PASSWORD"] = null,
            });

            var (controller, userManager, _) = await CreateControllerAsync();

            var result = await controller.RegisterFirstUser(new RegisterDto
            {
                Username = "Pax-kun",
                Email = "pax@example.com",
                Password = "Password123!",
            });

            var payload = Assert.IsType<UserDto>(result.Value);
            Assert.Equal("Pax-kun", payload.Username);
            Assert.Equal("pax@example.com", payload.Email);
            Assert.Equal("jwt-token", payload.Token);
            Assert.Equal("refresh-token", payload.RefreshToken);

            var admins = await userManager.GetUsersInRoleAsync(PolicyConstants.AdminRole);
            Assert.Single(admins);
            Assert.Equal("Pax-kun", admins[0].UserName);
        }
        finally
        {
            EnvLock.Release();
        }
    }

    private async Task<(AccountController Controller, UserManager<AppUser> UserManager, IUnitOfWork UnitOfWork)>
        CreateControllerAsync()
    {
        var (unitOfWork, context, mapper) = await CreateDatabase();
        var userManager = await CreateUserManagerAsync(context);
        var localizationService = CreateLocalizationService();
        var accountService = new AccountService(
            userManager,
            Substitute.For<ILogger<AccountService>>(),
            unitOfWork,
            mapper,
            localizationService);
        var tokenService = Substitute.For<ITokenService>();
        tokenService.CreateToken(Arg.Any<AppUser>()).Returns(Task.FromResult("jwt-token"));
        tokenService.CreateRefreshToken(Arg.Any<AppUser>()).Returns(Task.FromResult("refresh-token"));

        var controller = new AccountController(
            userManager,
            null!,
            tokenService,
            unitOfWork,
            Substitute.For<ILogger<AccountController>>(),
            mapper,
            accountService,
            Substitute.For<IEmailService>(),
            Substitute.For<IEventHub>(),
            localizationService,
            Substitute.For<IAuthenticationSchemeProvider>(),
            Substitute.For<IAuthKeyCacheInvalidator>(),
            Substitute.For<IHttpClientFactory>())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext()
            }
        };

        return (controller, userManager, unitOfWork);
    }

    private static async Task<UserManager<AppUser>> CreateUserManagerAsync(DataContext context)
    {
        var roleStore = new RoleStore<
            AppRole,
            DataContext,
            int,
            IdentityUserRole<int>,
            IdentityRoleClaim<int>
        >(context);

        var roleManager = new RoleManager<AppRole>(
            roleStore,
            [new RoleValidator<AppRole>()],
            new UpperInvariantLookupNormalizer(),
            new IdentityErrorDescriber(),
            Substitute.For<ILogger<RoleManager<AppRole>>>());

        foreach (var role in PolicyConstants.ValidRoles)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new AppRole
                {
                    Name = role,
                });
            }
        }

        var userStore = new UserStore<
            AppUser,
            AppRole,
            DataContext,
            int,
            IdentityUserClaim<int>,
            AppUserRole,
            IdentityUserLogin<int>,
            IdentityUserToken<int>,
            IdentityRoleClaim<int>
        >(context);

        var userManager = Substitute.ForPartsOf<UserManager<AppUser>>(
            userStore,
            new OptionsWrapper<IdentityOptions>(new IdentityOptions()),
            new PasswordHasher<AppUser>(),
            [new UserValidator<AppUser>()],
            [new PasswordValidator<AppUser>()],
            new UpperInvariantLookupNormalizer(),
            new IdentityErrorDescriber(),
            null!,
            Substitute.For<ILogger<UserManager<AppUser>>>());

        userManager.GenerateEmailConfirmationTokenAsync(Arg.Any<AppUser>()).Returns(Task.FromResult("confirm-token"));
        userManager.ConfirmEmailAsync(Arg.Any<AppUser>(), Arg.Any<string>()).Returns(Task.FromResult(IdentityResult.Success));

        return userManager;
    }

    private static ILocalizationService CreateLocalizationService()
    {
        var localizationService = Substitute.For<ILocalizationService>();
        localizationService
            .Get(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object[]>())
            .Returns(callInfo => Task.FromResult(callInfo.ArgAt<string>(1)));
        localizationService
            .Translate(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<object[]>())
            .Returns(callInfo => Task.FromResult(callInfo.ArgAt<string>(1)));
        localizationService.GetLocales().Returns(Array.Empty<KavitaLocale>());
        return localizationService;
    }

    private sealed class EnvironmentVariableScope : IDisposable
    {
        private readonly Dictionary<string, string?> _previousValues;

        public EnvironmentVariableScope(IDictionary<string, string?> variables)
        {
            _previousValues = new Dictionary<string, string?>(variables.Count);

            foreach (var (key, value) in variables)
            {
                _previousValues[key] = Environment.GetEnvironmentVariable(key);
                Environment.SetEnvironmentVariable(key, value);
            }
        }

        public void Dispose()
        {
            foreach (var (key, value) in _previousValues)
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }
}
