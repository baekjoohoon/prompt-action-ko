using System.Buffers.Binary;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PromptAction.NativeHost;

internal static class NativeMessagingProtocol
{
    private const int MaxFrameBytes = 1024 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static bool TryReadJson(Stream input, out string? json)
    {
        json = null;
        var lengthBuffer = new byte[sizeof(uint)];
        var firstRead = input.Read(lengthBuffer, 0, lengthBuffer.Length);
        if (firstRead == 0)
        {
            return false;
        }

        ReadRemaining(input, lengthBuffer, firstRead);
        var length = BinaryPrimitives.ReadUInt32LittleEndian(lengthBuffer);
        if (length == 0 || length > MaxFrameBytes)
        {
            throw new NativeProtocolException("INVALID_FRAME", "The native message frame is invalid.");
        }

        var payload = new byte[(int)length];
        ReadRemaining(input, payload, 0);
        json = Encoding.UTF8.GetString(payload);
        return true;
    }

    public static void WriteJson(Stream output, NativeResponse response)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(response, JsonOptions);
        if (payload.Length > MaxFrameBytes)
        {
            throw new NativeProtocolException("RESPONSE_TOO_LARGE", "The native response is too large.");
        }

        var lengthBuffer = new byte[sizeof(uint)];
        BinaryPrimitives.WriteUInt32LittleEndian(lengthBuffer, (uint)payload.Length);
        output.Write(lengthBuffer, 0, lengthBuffer.Length);
        output.Write(payload, 0, payload.Length);
        output.Flush();
    }

    private static void ReadRemaining(Stream input, byte[] buffer, int alreadyRead)
    {
        var offset = alreadyRead;
        while (offset < buffer.Length)
        {
            var read = input.Read(buffer, offset, buffer.Length - offset);
            if (read == 0)
            {
                throw new NativeProtocolException("TRUNCATED_FRAME", "The native message frame was truncated.");
            }
            offset += read;
        }
    }
}
