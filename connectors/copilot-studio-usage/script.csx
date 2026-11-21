using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

public class Script : ScriptBase
{
    private const int MaxCsvCharacters = 8 * 1024 * 1024;

    public override async Task<HttpResponseMessage> ExecuteAsync()
    {
        var request = Context.Request;
        var operation = Context.OperationId;
        if (operation != "StartAgentUsageReport" && operation != "CheckAgentUsageReport" && operation != "DownloadAgentUsageReport")
        {
            try { operation = Encoding.UTF8.GetString(Convert.FromBase64String(operation)); }
            catch (FormatException) { }
        }

        var response = await Context.SendAsync(request, CancellationToken).ConfigureAwait(false);
        if ((int)response.StatusCode == 429)
            return Json(response, new JObject { ["status"] = "Throttled", ["retryAfterSeconds"] = RetrySeconds(response) });
        if (!response.IsSuccessStatusCode)
            return response;

        if (operation == "StartAgentUsageReport")
        {
            var location = response.Headers.Location;
            var operationId = location == null ? null : location.OriginalString.Split('?')[0].Split('/').Last();
            Guid id;
            if (response.StatusCode != HttpStatusCode.Accepted || !Guid.TryParse(operationId, out id))
                return BadReport(response, "The licensing service did not return a report operation ID.");
            return Json(response, new JObject
            {
                ["status"] = "Running",
                ["operationId"] = id.ToString(),
                ["retryAfterSeconds"] = RetrySeconds(response)
            });
        }

        if (operation == "CheckAgentUsageReport")
        {
            var data = JObject.Parse(await response.Content.ReadAsStringAsync().ConfigureAwait(false));
            if ((string)data["status"] == "Running")
                data["retryAfterSeconds"] = RetrySeconds(response);
            return Json(response, data);
        }

        if (operation != "DownloadAgentUsageReport")
            return response;

        var bytes = await response.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
        using (var buffer = new MemoryStream(bytes))
        using (var stream = bytes.Length >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b
            ? (Stream)new GZipStream(buffer, CompressionMode.Decompress) : buffer)
        using (var reader = new StreamReader(stream, Encoding.UTF8))
        {
            var csv = new StringBuilder();
            var chunk = new char[8192];
            int length;
            while ((length = await reader.ReadAsync(chunk, 0, chunk.Length).ConfigureAwait(false)) != 0)
            {
                if (csv.Length + length > MaxCsvCharacters)
                    return BadReport(response, "The report is too large. Select a shorter date range.");
                csv.Append(chunk, 0, length);
            }
            return Json(response, new JObject { ["csv"] = csv.ToString() });
        }
    }

    private static int RetrySeconds(HttpResponseMessage response)
    {
        var retry = response.Headers.RetryAfter;
        var seconds = retry?.Delta?.TotalSeconds ?? (retry?.Date - DateTimeOffset.UtcNow)?.TotalSeconds;
        return seconds.HasValue && seconds.Value > 0 && seconds.Value < int.MaxValue
            ? (int)Math.Ceiling(seconds.Value)
            : 300;
    }

    private static HttpResponseMessage BadReport(HttpResponseMessage response, string message)
    {
        response.StatusCode = HttpStatusCode.BadGateway;
        return Json(response, new JObject { ["error"] = new JObject { ["message"] = message } });
    }

    private static HttpResponseMessage Json(HttpResponseMessage response, JObject data)
    {
        var previous = response.Content;
        response.Content = CreateJsonContent(data.ToString(Newtonsoft.Json.Formatting.None));
        previous?.Dispose();
        return response;
    }
}
