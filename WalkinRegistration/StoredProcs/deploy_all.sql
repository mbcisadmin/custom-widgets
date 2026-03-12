-- ============================================================
-- WalkinRegistration: One-time deploy script
-- Run this in SSMS against your MinistryPlatform database.
-- It creates both stored procs and grants access to apiuser.
-- ============================================================

-- ── 1. GetConfig (reads groups + campus name) ──────────────

IF OBJECT_ID('dbo.api_custom_WalkinReg_GetConfig', 'P') IS NOT NULL
  DROP PROCEDURE dbo.api_custom_WalkinReg_GetConfig;
GO

CREATE PROCEDURE [dbo].[api_custom_WalkinReg_GetConfig]
  @CongregationID INT           = NULL,
  @UserName       NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT Group_ID, Group_Name
  FROM Groups
  WHERE Group_ID IN (
    53012, 53013, 53014, 53015, 53016,
    53017, 53018, 53019, 53020, 53021, 53022, 53023
  )
  ORDER BY Group_Name;

  SELECT Congregation_ID, Congregation_Name
  FROM Congregations
  WHERE @CongregationID IS NOT NULL
    AND Congregation_ID = @CongregationID;
END
GO

GRANT EXECUTE ON [dbo].[api_custom_WalkinReg_GetConfig] TO [apiuser];
GO

-- ── 2. CreateFamily (registers household + contacts + groups) ──

IF OBJECT_ID('dbo.api_custom_WalkinReg_CreateFamily', 'P') IS NOT NULL
  DROP PROCEDURE dbo.api_custom_WalkinReg_CreateFamily;
GO

CREATE PROCEDURE [dbo].[api_custom_WalkinReg_CreateFamily]
  @ParentFirstName  NVARCHAR(100),
  @ParentLastName   NVARCHAR(100),
  @ParentEmail      NVARCHAR(255),
  @ParentPhone      NVARCHAR(50),
  @CongregationID   INT           = NULL,
  @ChildrenJSON     NVARCHAR(MAX),
  @UserName         NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO Households (Household_Name, Congregation_ID, Domain_ID)
    VALUES (@ParentLastName, @CongregationID, 1);

    DECLARE @HouseholdID INT = SCOPE_IDENTITY();

    INSERT INTO Contacts (
      First_Name, Last_Name, Display_Name,
      Email_Address, Mobile_Phone,
      Household_ID, Household_Position_ID, Domain_ID
    )
    VALUES (
      @ParentFirstName, @ParentLastName,
      @ParentLastName + ', ' + @ParentFirstName,
      @ParentEmail, @ParentPhone,
      @HouseholdID, 1, 1
    );

    DECLARE @ChildFirst NVARCHAR(100), @ChildLast NVARCHAR(100);
    DECLARE @ChildDOB DATE, @GroupID INT;
    DECLARE @ContactID INT, @ParticipantID INT;

    DECLARE child_cursor CURSOR FOR
      SELECT
        JSON_VALUE(value, '$.firstName'),
        JSON_VALUE(value, '$.lastName'),
        TRY_CAST(JSON_VALUE(value, '$.birthdate') AS DATE),
        TRY_CAST(JSON_VALUE(value, '$.groupId')   AS INT)
      FROM OPENJSON(@ChildrenJSON);

    OPEN child_cursor;
    FETCH NEXT FROM child_cursor INTO @ChildFirst, @ChildLast, @ChildDOB, @GroupID;

    WHILE @@FETCH_STATUS = 0
    BEGIN
      INSERT INTO Contacts (
        First_Name, Last_Name, Display_Name,
        Date_of_Birth, Household_ID, Household_Position_ID, Domain_ID
      )
      VALUES (
        @ChildFirst, @ChildLast,
        @ChildLast + ', ' + @ChildFirst,
        @ChildDOB, @HouseholdID, 2, 1
      );

      SET @ContactID = SCOPE_IDENTITY();
      SET @ParticipantID = NULL;

      SELECT @ParticipantID = Participant_ID
      FROM Participants WHERE Contact_ID = @ContactID;

      IF @ParticipantID IS NULL
      BEGIN
        INSERT INTO Participants (Contact_ID, Participant_Type_ID, Domain_ID)
        VALUES (@ContactID, 4, 1);
        SET @ParticipantID = SCOPE_IDENTITY();
      END

      IF @GroupID IS NOT NULL AND @GroupID > 0
      BEGIN
        INSERT INTO Group_Participants (
          Group_ID, Participant_ID, Group_Role_ID, Start_Date, Domain_ID
        )
        VALUES (@GroupID, @ParticipantID, 16, GETDATE(), 1);
      END

      FETCH NEXT FROM child_cursor INTO @ChildFirst, @ChildLast, @ChildDOB, @GroupID;
    END

    CLOSE child_cursor;
    DEALLOCATE child_cursor;
    COMMIT TRANSACTION;

    SELECT @HouseholdID AS Household_ID, CAST(1 AS BIT) AS Success,
           'Family registered successfully' AS Message;

  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    IF CURSOR_STATUS('local', 'child_cursor') >= 0
    BEGIN CLOSE child_cursor; DEALLOCATE child_cursor; END

    SELECT NULL AS Household_ID, CAST(0 AS BIT) AS Success,
           ERROR_MESSAGE() AS Message;
  END CATCH
END
GO

GRANT EXECUTE ON [dbo].[api_custom_WalkinReg_CreateFamily] TO [apiuser];
GO

PRINT 'Done — both procs created and apiuser granted execute.';
GO
