using System.Diagnostics;
using System.Text.Json;

namespace PromptAction.NativeHost;

internal sealed class RequestHandler
{
    private const int MaxPromptLength = 20000;
    private const int MaxRequestIdLength = 100;
    private const string DefaultEffort = "low";
    private readonly CodexRunner codexRunner;

    public RequestHandler(CodexRunner codexRunner)
    {
        this.codexRunner = codexRunner;
    }

    public async Task<NativeResponse> HandleAsync(string requestJson)
    {
        var hostStartedAt = Stopwatch.GetTimestamp();
        try
        {
            using var document = JsonDocument.Parse(requestJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return NativeResponse.Failure(ErrorCodes.InvalidRequest, "The request shape is invalid.");
            }

            var requestIdResult = TryReadRequestId(root);
            if (!requestIdResult.IsValid)
            {
                return NativeResponse.Failure(ErrorCodes.InvalidRequest, "requestId must be a short string.");
            }
            var requestId = requestIdResult.Value;

            if (!root.TryGetProperty("action", out var actionProperty) ||
                actionProperty.ValueKind != JsonValueKind.String)
            {
                return NativeResponse.Failure(ErrorCodes.InvalidRequest, "action must be a string.", requestId);
            }

            var action = actionProperty.GetString();
            if (action == "ping")
            {
                if (!HasOnlyProperties(root, "action", "requestId"))
                {
                    return NativeResponse.Failure(ErrorCodes.InvalidRequest, "The ping request is invalid.", requestId);
                }
                return NativeResponse.Ping(CodexExecutableResolver.TryResolve() is not null, requestId);
            }

            if (action != "optimize_prompt")
            {
                return NativeResponse.Failure(ErrorCodes.UnknownAction, "The action is not supported.", requestId);
            }

            if (!HasOnlyProperties(root, "action", "text", "effort", "requestId") ||
                !root.TryGetProperty("text", out var textProperty) ||
                textProperty.ValueKind != JsonValueKind.String)
            {
                return NativeResponse.Failure(ErrorCodes.InvalidRequest, "text must be a string.", requestId);
            }

            var text = textProperty.GetString() ?? string.Empty;
            if (text.Length > MaxPromptLength)
            {
                return NativeResponse.Failure(ErrorCodes.InputTooLarge, "The prompt is too large.", requestId);
            }
            if (string.IsNullOrWhiteSpace(text))
            {
                return NativeResponse.Failure(ErrorCodes.EmptyPrompt, "The prompt is empty.", requestId);
            }

            var effortResult = TryReadEffort(root);
            if (!effortResult.IsValid)
            {
                return NativeResponse.Failure(
                    ErrorCodes.InvalidRequest,
                    "effort must be low or medium.",
                    requestId);
            }

            return await codexRunner.OptimizeAsync(
                text,
                effortResult.Value ?? DefaultEffort,
                requestId,
                hostStartedAt);
        }
        catch (JsonException)
        {
            return NativeResponse.Failure(ErrorCodes.InvalidRequest, "The request is not valid JSON.");
        }
    }

    public static string? TryGetRequestId(string requestJson)
    {
        try
        {
            using var document = JsonDocument.Parse(requestJson);
            var result = TryReadRequestId(document.RootElement);
            return result.IsValid ? result.Value : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static ParsedString TryReadRequestId(JsonElement root)
    {
        if (!root.TryGetProperty("requestId", out var property))
        {
            return ParsedString.Valid(null);
        }
        if (property.ValueKind != JsonValueKind.String)
        {
            return ParsedString.Invalid();
        }

        var value = property.GetString();
        return value is not null && value.Length > 0 && value.Length <= MaxRequestIdLength
            ? ParsedString.Valid(value)
            : ParsedString.Invalid();
    }

    private static ParsedString TryReadEffort(JsonElement root)
    {
        if (!root.TryGetProperty("effort", out var property))
        {
            return ParsedString.Valid(null);
        }
        if (property.ValueKind != JsonValueKind.String)
        {
            return ParsedString.Invalid();
        }

        var value = property.GetString();
        return value is "low" or "medium"
            ? ParsedString.Valid(value)
            : ParsedString.Invalid();
    }

    private static bool HasOnlyProperties(JsonElement root, params string[] allowedProperties)
    {
        var allowed = new HashSet<string>(allowedProperties, StringComparer.Ordinal);
        foreach (var property in root.EnumerateObject())
        {
            if (!allowed.Contains(property.Name))
            {
                return false;
            }
        }
        return true;
    }

    private readonly record struct ParsedString(bool IsValid, string? Value)
    {
        public static ParsedString Valid(string? value) => new(true, value);
        public static ParsedString Invalid() => new(false, null);
    }

}
