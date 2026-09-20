using System.Text.Json;

namespace PromptAction.NativeHost;

internal static class Program
{
    private static async Task<int> Main()
    {
        var input = Console.OpenStandardInput();
        var output = Console.OpenStandardOutput();
        var handler = new RequestHandler(new CodexRunner());

        try
        {
            while (NativeMessagingProtocol.TryReadJson(input, out var requestJson))
            {
                NativeResponse response;
                try
                {
                    response = await handler.HandleAsync(requestJson!);
                }
                catch (Exception exception)
                {
                    Console.Error.WriteLine($"Prompt Action request failure: {exception.GetType().Name}");
                    response = NativeResponse.Failure(
                        ErrorCodes.ConfigurationError,
                        "Prompt Action 설정을 확인해주세요.",
                        RequestHandler.TryGetRequestId(requestJson ?? string.Empty));
                }

                NativeMessagingProtocol.WriteJson(output, response);
            }

            return 0;
        }
        catch (NativeProtocolException exception)
        {
            Console.Error.WriteLine($"Prompt Action protocol failure: {exception.Code}");
            return 1;
        }
        catch (IOException)
        {
            return 0;
        }
    }
}

internal static class ErrorCodes
{
    public const string InvalidRequest = "INVALID_REQUEST";
    public const string UnknownAction = "UNKNOWN_ACTION";
    public const string InputTooLarge = "INPUT_TOO_LARGE";
    public const string EmptyPrompt = "EMPTY_PROMPT";
    public const string CodexNotFound = "CODEX_NOT_FOUND";
    public const string CodexNotAuthenticated = "CODEX_NOT_AUTHENTICATED";
    public const string CodexTimeout = "CODEX_TIMEOUT";
    public const string CodexFailed = "CODEX_FAILED";
    public const string CodexEmptyResponse = "CODEX_EMPTY_RESPONSE";
    public const string PromptInstructionMissing = "PROMPT_INSTRUCTION_MISSING";
    public const string ConfigurationError = "CONFIGURATION_ERROR";
}

internal sealed class NativeResponse
{
    public bool Ok { get; init; }
    public string? RequestId { get; init; }
    public string? Text { get; init; }
    public NativeError? Error { get; init; }
    public string? Host { get; init; }
    public bool? CodexAvailable { get; init; }
    public NativeTimingMetadata? Meta { get; init; }

    public static NativeResponse Success(string text, NativeTimingMetadata meta, string? requestId) => new()
    {
        Ok = true,
        RequestId = requestId,
        Text = text,
        Meta = meta
    };

    public static NativeResponse Ping(bool codexAvailable, string? requestId) => new()
    {
        Ok = true,
        RequestId = requestId,
        Host = "Prompt Action",
        CodexAvailable = codexAvailable
    };

    public static NativeResponse Failure(string code, string message, string? requestId = null) => new()
    {
        Ok = false,
        RequestId = requestId,
        Error = new NativeError { Code = code, Message = message }
    };
}

internal sealed class NativeError
{
    public string Code { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
}

internal sealed class NativeTimingMetadata
{
    public string Effort { get; init; } = "low";
    public long CodexTotalMs { get; init; }
    public long HostTotalMs { get; init; }
    public long HostOverheadMs { get; init; }
    public long CodexProcessStartMs { get; init; }
}

internal sealed class NativeProtocolException : Exception
{
    public NativeProtocolException(string code, string message) : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}
