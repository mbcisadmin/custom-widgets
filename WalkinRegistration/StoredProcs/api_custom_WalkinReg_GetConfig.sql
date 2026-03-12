-- ============================================================
-- api_custom_WalkinReg_GetConfig
--
-- Returns config data needed by the WalkinRegistration widget:
--   DataSet1 — Kids Quest groups (for the volunteer group dropdown)
--   DataSet2 — Campus/congregation name (displayed in the page header)
--
-- Parameters:
--   @CongregationID  INT   — optional; passed via ?locationId= URL param
--   @UserName        NVARCHAR(255) — injected automatically by MP widget framework
-- ============================================================

CREATE PROCEDURE [dbo].[api_custom_WalkinReg_GetConfig]
  @CongregationID INT           = NULL,
  @UserName       NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  -- DataSet1: Kids Quest groups for the group assignment dropdown
  SELECT
    Group_ID,
    Group_Name
  FROM Groups
  WHERE Group_ID IN (
    53012, 53013, 53014, 53015, 53016,
    53017, 53018, 53019, 53020, 53021, 53022, 53023
  )
  ORDER BY Group_Name;

  -- DataSet2: Campus name to display at the top of the form
  -- Returns empty set if @CongregationID is NULL (no locationId in URL)
  SELECT
    Congregation_ID,
    Congregation_Name
  FROM Congregations
  WHERE @CongregationID IS NOT NULL
    AND Congregation_ID = @CongregationID;

END
